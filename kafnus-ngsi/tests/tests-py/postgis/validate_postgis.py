# Copyright 2025 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
# PROJECT: Kafnus
#
# This software and / or computer program has been developed by Telefónica Soluciones
# de Informática y Comunicaciones de España, S.A.U (hereinafter TSOL) and is protected
# as copyright by the applicable legislation on intellectual property.
#
# It belongs to TSOL, and / or its licensors, the exclusive rights of reproduction,
# distribution, public communication and transformation, and any economic right on it,
# all without prejudice of the moral rights of the authors mentioned above. It is expressly
# forbidden to decompile, disassemble, reverse engineer, sublicense or otherwise transmit
# by any means, translate or create derivative works of the software and / or computer
# programs, and perform with respect to all or part of such programs, any type of exploitation.
#
# Any use of all or part of the software and / or computer program will require the
# express written consent of TSOL. In all cases, it will be necessary to make
# an express reference to TSOL ownership in the software and / or computer
# program.
#
# Non-fulfillment of the provisions set forth herein and, in general, any violation of
# the peaceful possession and ownership of these rights will be prosecuted by the means
# provided in both Spanish and international law. TSOL reserves any civil or
# criminal actions it may exercise to protect its rights.

import psycopg2
import json
from dateutil import parser as dateparser
import argparse
from shapely.wkb import loads as load_wkb
import binascii
import ast
import datetime

def load_test_spec(path):
    """Loads a JSON test specification from a given file path."""
    with open(path) as f:
        return json.load(f)

def convert_row(row, colnames):
    """Converts a raw database row (tuple) into a dictionary using column names."""
    return {colnames[i]: value for i, value in enumerate(row)}

def looks_like_datetime(value):
    """Check if the value can be parsed as a datetime."""
    if isinstance(value, datetime.datetime):
        return True
    if isinstance(value, str):
        try:
            dateparser.parse(value)
            return True
        except (ValueError, TypeError):
            return False
    return False

def normalize_datetime(value):
    """Normalize datetime values to UTC for consistent comparison."""
    if isinstance(value, datetime.datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = dateparser.parse(value)
        except Exception:
            return value
    else:
        return value

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    else:
        dt = dt.astimezone(datetime.timezone.utc)
    return dt

def compare_row(expected, actual):
    """
    Compares an expected row against an actual row from the database.

    Handles:
        - Geometry conversion from WKB to WKT
        - Datetime normalization and tolerance check
        - JSON string parsing before comparison
        - Numeric normalization
        - Comparison operators like gte, lte, etc.
    """
    for key, expected_value in expected.items():
        actual_value = actual.get(key)

        # Geometry conversion
        if key in ("location", "polygon") and isinstance(expected_value, str):
            try:
                if actual_value is not None and not isinstance(actual_value, str):
                    actual_geom = load_wkb(bytes(actual_value))
                else:
                    actual_geom = load_wkb(binascii.unhexlify(actual_value))
                actual_value = actual_geom.wkt
            except Exception as e:
                print(f"⚠️ Error converting '{key}' from WKB to WKT: {e}")
                return False

        # Datetime normalization and tolerance (1 ms)
        if looks_like_datetime(expected_value) or looks_like_datetime(actual_value):
            expected_dt = normalize_datetime(expected_value)
            actual_dt = normalize_datetime(actual_value)
            if isinstance(expected_dt, datetime.datetime) and isinstance(actual_dt, datetime.datetime):
                if abs((expected_dt - actual_dt).total_seconds()) > 0.001:
                    return False
                continue

        # Normalize float to int when needed
        if isinstance(expected_value, int) and isinstance(actual_value, float):
            actual_value = int(actual_value)

        # Comparison operators
        if isinstance(expected_value, dict):
            for op, val in expected_value.items():
                if op == "gte" and not (actual_value >= val):
                    return False
                elif op == "lte" and not (actual_value <= val):
                    return False
                elif op == "gt" and not (actual_value > val):
                    return False
                elif op == "lt" and not (actual_value < val):
                    return False
                elif op == "eq" and actual_value != val:
                    return False
        else:
            # Try parsing JSON in expected value
            if isinstance(expected_value, str):
                try:
                    expected_value = json.loads(expected_value)
                except (ValueError, json.JSONDecodeError):
                    pass

            # Try parsing JSON in actual value
            if isinstance(actual_value, str):
                try:
                    actual_value = json.loads(actual_value)
                except (ValueError, json.JSONDecodeError):
                    pass

            # Final value comparison
            if actual_value != expected_value:
                return False
    return True

def validate_data(test_spec):
    """Validates PostGIS data against the given test specification."""
    conn_info = test_spec["connection"]
    table = test_spec["table"]
    conditions = test_spec["conditions"]

    conn = psycopg2.connect(
        host=conn_info["host"],
        port=conn_info.get("port", 5432),
        dbname=conn_info["dbname"],
        user=conn_info["user"],
        password=conn_info["password"]
    )

    with conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT * FROM {table}")
            colnames = [desc[0] for desc in cur.description]
            rows = cur.fetchall()

    matched = 0
    for expected_row in conditions:
        if any(compare_row(expected_row, convert_row(row, colnames)) for row in rows):
            matched += 1
        else:
            print(f"❌ No matching row found for: {expected_row}")

    if matched == len(conditions):
        print(f"✅ All checks ({matched}) passed successfully.")
    else:
        print(f"⚠️ Only {matched}/{len(conditions)} rows matched the expectations.")

def main():
    """CLI entry point for validating PostGIS content."""
    parser = argparse.ArgumentParser(description="Validate PostGIS content against a JSON test specification.")
    parser.add_argument("--test", required=True, help="JSON file with the test specification.")
    args = parser.parse_args()

    test_spec = load_test_spec(args.test)
    validate_data(test_spec)

if __name__ == "__main__":
    main()
