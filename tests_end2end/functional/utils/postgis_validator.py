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
import time
from config import logger

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
        logger.info(f"✅ Validating table {table} with timeout={timeout}")
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
            if isinstance(expected_value, float) and isinstance(actual_value, float):
                if abs(expected_value - actual_value) > 0.001:
                    return False
            elif expected_value != actual_value:
                return False
        return True
