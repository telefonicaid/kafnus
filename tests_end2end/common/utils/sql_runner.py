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

import psycopg2

from common.config import logger

def execute_sql_file(sql_path, db_config):
    """
    Executes the SQL statements in the given file against a PostgreSQL database.

    Connects to the database using the provided configuration, reads the SQL file,
    and executes its content within a transaction. Closes the connection after execution.

    Parameters:
    - sql_path: Path to the .sql file to execute.
    - db_config: Dictionary with keys: dbname, user, password, host, and port.

    Raises:
    - Exception if SQL execution or database connection fails.
    """
    logger.debug(f"📄 Executing SQL from: {sql_path}")
    logger.debug(f"🔗 Connecting to DB: {db_config['host']}:{db_config['port']}, DB: {db_config['dbname']}")

    with open(sql_path, "r", encoding="utf-8") as f:
        sql = f.read()

    try:
        conn = psycopg2.connect(**db_config)
        logger.debug("✅ Connection established")

        with conn:
            with conn.cursor() as cursor:
                cursor.execute(sql)
                logger.info("✅ SQL executed successfully")
    except Exception as e:
        logger.error(f"❌ Error executing SQL from {sql_path}: {e}")
        raise
    finally:
        conn.close()
        logger.debug("🔌 Connection closed")
