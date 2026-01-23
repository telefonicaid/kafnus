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
#
# Authors: 
#  - Álvaro Vega
#  - Gregorio Blázquez

import os
import subprocess
import time
import psycopg2

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
TESTS_DIR = CURRENT_DIR

# DB config from environment variables
DEFAULT_DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "dbname": "tests",
    "user": "postgres",
    "password": "postgres",
}

def execute_sql_file(sql_path, db_config):
    """
    Executes the SQL statements in the given file against a PostgreSQL database.
    """
    print(f"📄 Executing SQL from: {sql_path}")
    print(f"🔗 Connecting to DB: {db_config['host']}:{db_config['port']}, DB: {db_config['dbname']}")

    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()

    try:
        conn = psycopg2.connect(**db_config)
        print("✅ Connection established")

        with conn:
            with conn.cursor() as cursor:
                cursor.execute(sql)
                print("✅ SQL executed successfully")
    except Exception as e:
        print(f"❌ Error executing SQL from {sql_path}: {e}")
        raise
    finally:
        conn.close()
        print("🔌 Connection closed")


def run_tests():
    for root, dirs, files in sorted(os.walk(TESTS_DIR), key=lambda x: x[0]):
        files = sorted(files)

        # Run setup.sql if present in the test folder
        setup_sql = [f for f in files if f.lower() == "setup_tables.sql"]
        if setup_sql:
            sql_path = os.path.join(root, setup_sql[0])
            execute_sql_file(sql_path, DEFAULT_DB_CONFIG)

        # Group by notification and expected
        notifications = [f for f in files if f.endswith("_notification.json")]
        expecteds = [f for f in files if f.endswith("_expected.json")]

        if not notifications or not expecteds:
            continue  # Nothing to do

        print(f"\n🧪 Running tests in: {root}")

        for notif_file in notifications:
            notif_path = os.path.join(root, notif_file)
            print(f"📤 Sending notification: {notif_path}")
            subprocess.run(["python3", "../producer.py", notif_path], check=True)

        # Wait between send and check
        time.sleep(1)

        for expected_file in expecteds:
            expected_path = os.path.join(root, expected_file)
            print(f"🔍 Validating: {expected_path}")
            subprocess.run(["python3", "validate_postgis.py", "--test", expected_path], check=True)


if __name__ == "__main__":
    run_tests()
