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
#  - Fermín Galán
#  - Oriana Romero

import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Default database configuration used for testing, with env vars supports
DEFAULT_DB_CONFIG = {
    "host": os.getenv("KAFNUS_TESTS_PG_HOST", "localhost"),
    "port": int(os.getenv("KAFNUS_TESTS_PG_PORT", 5432)),
    "dbname": os.getenv("KAFNUS_TESTS_PG_DBNAME", "tests"),
    "user": os.getenv("KAFNUS_TESTS_PG_USER", "postgres"),
    "password": os.getenv("KAFNUS_TESTS_PG_PASSWORD", "postgres"),
}

# Kafnus Connect default endpoint
KAFNUS_TESTS_KAFNUS_CONNECT_URL = os.getenv("KAFNUS_TESTS_KAFNUS_CONNECT_URL", "http://localhost:8083")

# Default connector name for health-check
KAFNUS_TESTS_DEFAULT_CONNECTOR_NAME = os.getenv("KAFNUS_TESTS_DEFAULT_CONNECTOR_NAME", "http-sink")

# Setup and start logger
def setup_test_logger(name="kafnus-tests"):
    """
    Initializes and returns a structured logger for test execution.
    Supports standard log levels: DEBUG, INFO, WARN, ERROR, FATAL.
    """
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARN": logging.WARNING,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
        "FATAL": logging.CRITICAL,
        "CRITICAL": logging.CRITICAL
    }

    raw_level = os.getenv("KAFNUS_TESTS_LOG_LEVEL", "INFO").upper()
    log_level = level_map.get(raw_level, logging.INFO)

    logging.basicConfig(
        level=log_level,
        format="time=%(asctime)s | lvl=%(levelname)s | comp=KAFNUS-TESTS | op=%(name)s:%(filename)s[%(lineno)d]:%(funcName)s | msg=%(message)s",
        handlers=[logging.StreamHandler()]
    )

    return logging.getLogger(name)

logger = setup_test_logger()
