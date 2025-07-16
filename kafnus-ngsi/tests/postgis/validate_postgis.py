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

def load_test_spec(path):
    """
    Loads a JSON test specification from a given file path.

    Args:
        path (str): Path to the test JSON file.

    Returns:
        dict: The parsed JSON content with connection info, table name, and expected rows.
    """
    with open(path) as f:
        return json.load(f)

def convert_row(row, colnames):
    """
    Converts a raw database row (tuple) into a dictionary using column names.

    Args:
        row (tuple): A row returned by psycopg2.
        colnames (list): List of column names.

    Returns:
        dict: Mapping of column names to values.
    """
    result = {}
    for i, value in enumerate(row):
        key = colnames[i]
        result[key] = value  # We do not convert timestamps to epoch millis
    return result

def compare_row(expected, actual):
    """
    Compares an expected row against an actual row from the database.

    Handles:
        - Geometry conversion from WKB to WKT
        - Timestamp parsing and comparison
        - JSON string comparison
        - Numeric normalization
        - Support for comparison operators like 'gte', 'lte', etc.

    Args:
        expected (dict): Expected row with possible operators.
        actual (dict): Actual row fetched from the database.

    Returns:
        bool: True if the actual row satisfies the expected conditions.
    """
    for key, expected_value in expected.items():
        actual_value = actual.get(key)
        
        # Convert binary geometry (WKB) to WKT text if a string like "POINT (...)" is expected
        if key in ("location", "polygon") and isinstance(expected_value, str):
            try:
                if actual_value is not None and not isinstance(actual_value, str):
                    # Just in case, for previous cases
                    actual_geom = load_wkb(bytes(actual_value))
                else:
                    # Hex string case
                    actual_geom = load_wkb(binascii.unhexlify(actual_value))
                actual_value = actual_geom.wkt
            except Exception as e:
                print(f"⚠️ Error converting '{key}' from WKB to WKT: {e}")
                return False            

        # If it's a timestamp in ISO string format, parse it to datetime
        if key in ("timeinstant", "recvtime") and isinstance(expected_value, str):
            expected_value = dateparser.isoparse(expected_value)

        # Normalize float to int
        if isinstance(expected_value, int) and isinstance(actual_value, float):
            actual_value = int(actual_value)

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
            # We need to cover when expected_value is a json
            if isinstance(expected_value, str):
                try:
                    parsed_expected = json.loads(expected_value)
                    expected_value = parsed_expected
                except (ValueError, json.JSONDecodeError):
                    pass  # No json, keep going

            # In case of json, actual_value should already be a dictionary, just in case
            if isinstance(actual_value, str):
                try:
                    parsed_actual = json.loads(actual_value)
                    actual_value = parsed_actual
                except (ValueError, json.JSONDecodeError):
                    pass

            # Final comparation
            if actual_value != expected_value:
                #print(f"🔎 Mismatch in '{key}': expected {expected_value}, got {actual_value}")
                return False
    return True

def validate_data(test_spec):
    """
    Validates PostGIS data against the given test specification.

    Args:
        test_spec (dict): JSON spec including connection info, target table, and expected rows.

    Prints:
        Success or failure messages based on the validation results.
    """
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
        match_found = False
        for row in rows:
            actual_row = convert_row(row, colnames)
            if compare_row(expected_row, actual_row):
                match_found = True
                break
        if match_found:
            matched += 1
        else:
            print(f"❌ No matching row found for: {expected_row}")

    if matched == len(conditions):
        print(f"✅ All checks ({matched}) passed successfully.")
    else:
        print(f"⚠️ Only {matched}/{len(conditions)} rows matched the expectations.")

def main():
    """
    CLI entry point for validating PostGIS content.

    Expects a --test argument pointing to a JSON file with:
        - Connection details
        - Table name
        - Expected rows to match
    """
    parser = argparse.ArgumentParser(description="Validate PostGIS content against a JSON test specification.")
    parser.add_argument("--test", required=True, help="JSON file with the test specification.")
    args = parser.parse_args()

    test_spec = load_test_spec(args.test)
    validate_data(test_spec)

if __name__ == "__main__":
    main()
