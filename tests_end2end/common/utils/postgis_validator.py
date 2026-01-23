# Copyright 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
#
# This file is part of kafnus
#
# kafnus is free software: you can redistribute it and/or
# modify it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# kafnus is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
# General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with kafnus. If not, see http://www.gnu.org/licenses/.


import psycopg2
from dateutil import parser as dateparser
import json
import datetime
import time
import math
from shapely.wkb import loads as load_wkb
from shapely.wkt import loads as load_wkt
from shapely.geometry import shape
import binascii
import re
from decimal import Decimal, InvalidOperation

from common.config import logger

class PostgisValidator:
    def __init__(self, db_config):
        self.db_config = db_config

    def _connect(self):
        return psycopg2.connect(
            dbname=self.db_config["dbname"],
            user=self.db_config["user"],
            password=self.db_config["password"],
            host=self.db_config["host"],
            port=self.db_config["port"]
        )

    def _query_table(self, table):
        logger.debug(f"🔍 Executing SELECT * FROM {table}")
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(f"SELECT * FROM {table}")
                rows = cursor.fetchall()
                colnames = [desc[0] for desc in cursor.description]
                result = [dict(zip(colnames, row)) for row in rows]
                logger.debug(f"📦 Rows found in {table}: {len(result)}")
                return result

    def validate(self, table, expected_rows, timeout=10, poll_interval=0.5):
        """
        Validates that the expected data is present in the table.

        - `expected_rows`: list of dicts with keys that must match in each row.
        - Repeats until all expected rows appear in the table, or the timeout is reached.
        """
        logger.info(f"Validating table {table} with timeout={timeout}")
        start = time.time()

        while time.time() - start < timeout:
            actual = self._query_table(table)

            if self._contains_expected_rows(actual, expected_rows):
                logger.debug(f"✅ Validation successful: all expected data found in {table}")
                return True

            time.sleep(poll_interval)

        logger.error(f"❌ Timeout: Expected data not found in {table}")
        return False

    def _contains_expected_rows(self, actual_rows, expected_rows):
        """
        Verifies that each expected row is present (partially) in the actual rows.
        Only compares keys present in expected_rows.
        """
        for expected in expected_rows:
            if not any(self._row_matches(expected, actual) for actual in actual_rows):
                logger.debug(f"🚫 Expected row not found: {expected}")
                return False
        return True

    def _row_matches(self, expected, actual):
        for key, expected_value in expected.items():
            actual_value = actual.get(key)

            # Skip key if it's not in the actual row
            if key not in actual:
                return False

            # Geometry comparison
            if (self._is_geojson(expected_value) or self._is_wkt(expected_value)) and isinstance(actual_value, str):
                try:
                    expected_geom = (
                        shape(expected_value) if self._is_geojson(expected_value) else load_wkt(expected_value)
                    )

                    # Detect if actual_value is WKB hex (only hex chars, even length, starts with '01' or '00')
                    is_wkb_hex = all(c in "0123456789ABCDEFabcdef" for c in actual_value) and len(actual_value) % 2 == 0

                    actual_geom = (
                        load_wkb(binascii.unhexlify(actual_value)) if is_wkb_hex else load_wkt(actual_value)
                    )

                    if not expected_geom.equals(actual_geom):
                        return False
                    continue
                except Exception as e:
                    logger.warning(f"❌ Error comparing geometry for key '{key}': {e}")
                    return False

            # Timestamp normalization
            if self._looks_like_datetime(expected_value) or self._looks_like_datetime(actual_value):
                expected_dt = self._normalize_datetime(expected_value)
                actual_dt = self._normalize_datetime(actual_value)

                if isinstance(expected_dt, datetime.datetime) and isinstance(actual_dt, datetime.datetime):
                    if abs((expected_dt - actual_dt).total_seconds()) > 0.001:
                        return False
                    continue

            # Normalize float to int if needed
            if isinstance(expected_value, int) and isinstance(actual_value, float):
                actual_value = int(actual_value)

            # Comparison with operators (gte, lt, etc.)
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
                    elif op == "contains":
                        if not (isinstance(actual_value, str) and isinstance(val, str)):
                            return False
                        if val not in actual_value:
                            return False
                    elif op == "regex":
                        if not (isinstance(actual_value, str) and isinstance(val, str)):
                            return False
                        try:
                            if not re.search(val, actual_value):
                                return False
                        except re.error as e:
                            print(f"⚠️ Invalid regex: {val} – {e}")

            else:
                # Try parse expected as JSON
                if isinstance(expected_value, str):
                    try:
                        parsed = json.loads(expected_value)
                        expected_value = parsed
                    except Exception:
                        pass

                # Try parse actual as JSON
                if isinstance(actual_value, str):
                    try:
                        parsed = json.loads(actual_value)
                        actual_value = parsed
                    except Exception:
                        pass

                # Normalize None/empty string
                if expected_value in ("", None) and actual_value in ("", None):
                    continue

                # Normalize types before comparing
                # Force Decimal conversion if both are numeric
                numeric_types = (int, float, Decimal)
                if isinstance(expected_value, numeric_types) and isinstance(actual_value, numeric_types):
                    try:
                        expected_value = Decimal(str(expected_value))
                        actual_value = Decimal(str(actual_value))
                    except InvalidOperation:
                        pass  # fallback below if needed

                # Final equality check for Decimal
                if isinstance(expected_value, Decimal) and isinstance(actual_value, Decimal):
                    if expected_value.normalize() != actual_value.normalize():
                        return False

                # Final equality check for float
                elif isinstance(expected_value, float) and isinstance(actual_value, float):
                    if not math.isclose(expected_value, actual_value, rel_tol=1e-6, abs_tol=1e-6):
                        return False

                # Fallback equality
                elif actual_value != expected_value:
                    return False
        # All keys matched successfully
        return True

    def _is_geojson(self, value):
        return (
            isinstance(value, dict)
            and "type" in value
            and "coordinates" in value
            and isinstance(value["coordinates"], (list, tuple))
        )
    
    def _is_wkt(self, value):
        return isinstance(value, str) and any(
            value.strip().upper().startswith(t) for t in ["POINT", "LINESTRING", "POLYGON", "MULTIPOINT", "MULTILINESTRING", "MULTIPOLYGON"]
        )
    
    def validate_absent(self, table, forbidden_rows, timeout=10, poll_interval=0.5):
        """
        Validates that the specified rows are NOT present in the table.

        - `forbidden_rows`: list of dicts that must NOT appear in the table.
        - Repeats until all forbidden rows are gone, or timeout is reached.
        """
        logger.info(f"🚫 Validating ABSENCE from table {table} with timeout={timeout}")
        start = time.time()

        while time.time() - start < timeout:
            actual = self._query_table(table)

            if self._none_of_forbidden_rows(actual, forbidden_rows):
                logger.debug(f"✅ Validation successful: forbidden rows absent from {table}")
                return True

            time.sleep(poll_interval)

        logger.error(f"❌ Timeout: Forbidden data still present in {table}")
        return False


    def _none_of_forbidden_rows(self, actual_rows, forbidden_rows):
        """
        Returns True if none of the forbidden rows is found in the actual rows.
        """
        for forbidden in forbidden_rows:
            if any(self._row_matches(forbidden, actual) for actual in actual_rows):
                logger.debug(f"🚫 Forbidden row still present: {forbidden}")
                return False
        return True

    def _looks_like_datetime(self, value):
        if isinstance(value, datetime.datetime):
            return True
        if isinstance(value, str):
            try:
                dateparser.parse(value)
                return True
            except (ValueError, TypeError):
                return False
        return False

    def _normalize_datetime(self, value):
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
    
    def count_rows(self, table):
        """
        Count the number of rows in a table.
        """
        query = f"SELECT COUNT(*) FROM {table}"
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                return cur.fetchone()[0]
    
    def wait_until_row_present(self, table, row, timeout=60, poll=1):
        """
        Wait until a specific row is present in the table.
        
        - `row`: dict with keys that must match in a single row.
        - Returns True if the row is found within the timeout, False otherwise.
        """
        logger.info(f"⏳ Waiting for row to appear in {table} (timeout={timeout}s)")
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.validate(table, [row], timeout=0.1):
                logger.debug(f"✅ Row found in {table}")
                return True
            time.sleep(poll)
        logger.error(f"❌ Row not found in {table} within {timeout}s")
        return False

