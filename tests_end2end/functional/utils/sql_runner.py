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

from config import logger
import psycopg2

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
