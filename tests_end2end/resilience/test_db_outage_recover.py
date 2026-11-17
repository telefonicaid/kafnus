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

import time
import pytest
from pathlib import Path

from common.common_test import OrionRequestData, ServiceOperations
from common.config import logger, DEFAULT_DB_CONFIG
from common.utils.sql_runner import execute_sql_file
from common.utils.postgis_validator import PostgisValidator
from common.utils.wait_services import wait_for_connector

TIMEOUT_DB_RECOVERY = 30  # seconds

# ----------------------------------------------------------------------
# MAIN TEST
# ----------------------------------------------------------------------
def test_db_outage_recover(multiservice_stack):
    """
    Simulates different Postgres outage scenarios and verifies that Kafnus Connect
    behaves correctly in each phase.

    The test is divided into three independent stages:

    1. **Initial ingestion with DB available**  
    - Postgres is running.  
    - A first update (E1) is sent through Orion.  
    - The JDBC sinks must write the record successfully into all target tables.

    2. **DB outage without incoming messages**  
    - Postgres is stopped.  
    - No new messages are sent during the outage.  
    - The connector will not fail because no poll cycle processes records.  
    - Postgres is started again.  
    - The connector must detect that the DB is back and transition back to RUNNING.  
    - A second update (E2) is sent and must be successfully written to the DB.

    3. **DB outage *with* incoming messages**  
    - Postgres is stopped again.  
    - A third update (E3) is sent while the DB is down.  
    - This time the connector task will attempt to write, fail, and transition to FAILED.  
    - Postgres is restarted.  
    - The connector must recover from FAILED back to RUNNING.  
    - All records (E1, E2, E3) must exist in the DB after recovery.

    """

    logger.info("Test case to verify Kafnus Connect behavior during Postgres outages. This tests covers:\n - Initial ingestion with DB available\n - DB outage without incoming messages\n - DB outage with incoming messages")

    docker_dir = str(Path(__file__).resolve().parents[2] / "docker")
    compose = multiservice_stack.compose

    connector_status_url = (
        f"http://{multiservice_stack.kafkaConnectHost}:"
        f"{multiservice_stack.KafkaConnectPort}/connectors/jdbc-historical-sink/status"
    )

    # ------------------------------------------------------------------
    # STEP 0: Execute setup.sql
    # ------------------------------------------------------------------
    setup_file = Path(__file__).resolve().parent / "setup.sql"

    logger.info(f"📜 Executing setup SQL: {setup_file}")
    execute_sql_file(setup_file, db_config=DEFAULT_DB_CONFIG)

    # ------------------------------------------------------------------
    # STEP 1A: Send first batch (DB OK)
    # ------------------------------------------------------------------
    first_update = OrionRequestData(
        name="recover1",
        service="test",
        subservice="/recover",
        subscriptions={
            "historic": {
                "description": "Test:HISTORIC:recover_test",
                "status": "active",
                "subject": {
                    "entities": [{"idPattern": ".*", "type": "Test"}],
                    "condition": {"attrs": ["TimeInstant"]}
                },
                "notification": {
                    "kafkaCustom": {
                        "url": "kafka://kafka:29092",
                        "topic": "smc_raw_historic"
                    },
                    "attrs": ["TimeInstant", "temperature"]
                }
            },
            "lastdata": {
                "description": "Test:LASTDATA:recover_test",
                "status": "active",
                "subject": {
                    "entities": [{"idPattern": ".*", "type": "Test"}],
                    "condition": {"attrs": ["TimeInstant"]}
                },
                "notification": {
                    "kafkaCustom": {
                        "url": "kafka://kafka:29092",
                        "topic": "smc_raw_lastdata"
                    },
                    "attrs": ["TimeInstant", "temperature"]
                }
            },
            "mutable": {
                "description": "Test:mutable:recover_test",
                "status": "active",
                "subject": {
                    "entities": [{"idPattern": ".*", "type": "Test"}],
                    "condition": {"attrs": ["TimeInstant"]}
                },
                "notification": {
                    "kafkaCustom": {
                        "url": "kafka://kafka:29092",
                        "topic": "smc_raw_mutable"
                    },
                    "attrs": ["TimeInstant", "temperature"]
                }
            },
        },
        updateEntities=[
            {
                "id": "E1",
                "type": "Test",
                "TimeInstant": {
                    "type": "DateTime",
                    "value": "2025-06-26T11:00:00Z"
                },
                "temperature": {"value": 1.0, "type": "Float"}
            }
        ]
    )

    ops = ServiceOperations(multiservice_stack, [first_update])
    ops.orion_set_up()

    time.sleep(4)

    # ------------------------------------------------------------------
    # STEP 1B: Validate the first batch is in DB
    # ------------------------------------------------------------------
    validator = PostgisValidator(DEFAULT_DB_CONFIG)

    ok = validator.validate("test.recover_test", [{"entityid": "E1"}])
    assert ok, "❌ First batch not found in recover_test table"

    ok = validator.validate("test.recover_test_lastdata", [{"entityid": "E1"}])
    assert ok, "❌ First batch not found in recover_test_lastdata table"

    ok = validator.validate("test.recover_test_mutable", [{"entityid": "E1"}])
    assert ok, "❌ First batch not found in recover_test_mutable table"

    logger.info("✅ First batch validated successfully")

    # ------------------------------------------------------------------
    # STEP 2A: Stop Postgres (simulate outage)
    # ------------------------------------------------------------------
    logger.info("⛔ Stopping Postgres…")
    compose.safe_stop("iot-postgis")
    time.sleep(3)

    # Give time for connector to fail
    time.sleep(TIMEOUT_DB_RECOVERY)

    # ------------------------------------------------------------------
    # STEP 2B: Start Postgres again
    # ------------------------------------------------------------------
    logger.info("🟢 Starting Postgres…")
    compose.safe_start("iot-postgis")
    time.sleep(5)

    # ------------------------------------------------------------------
    # STEP 2C: Wait for connector task recovery
    # ------------------------------------------------------------------
    for connector_name in (
        "jdbc-historical-sink",
        "jdbc-lastdata-sink",
        "jdbc-mutable-sink",
    ):
        wait_for_connector(
            name=connector_name,
            url=f"http://{multiservice_stack.kafkaConnectHost}:{multiservice_stack.KafkaConnectPort}"
        )

    # ------------------------------------------------------------------
    # STEP 2D: Send updates after recovery
    # ------------------------------------------------------------------
    second_update = OrionRequestData(
        name="recover2",
        service="test",
        subservice="/recover",
        subscriptions={},   # subscriptions already exist
        updateEntities=[
            {
                "id": "E2",
                "type": "Test",
                "TimeInstant": {"type": "DateTime", "value": "2025-06-26T12:00:00Z"},
                "temperature": {"value": 2.0, "type": "Float"},
            }
        ]
    )

    ops = ServiceOperations(multiservice_stack, [second_update])
    ops.orion_set_up()

    # ------------------------------------------------------------------
    # STEP 2E: Validate DB state (E1, E2)
    # ------------------------------------------------------------------
    validator = PostgisValidator(DEFAULT_DB_CONFIG)

    expected_rows = [{"entityid": "E1"}, {"entityid": "E2"}]

    for table in [
        "test.recover_test",
        "test.recover_test_lastdata",
        "test.recover_test_mutable",
    ]:
        ok = validator.validate(table, expected_rows, timeout=60)
        assert ok, f"❌ Not all entities were persisted in {table}"

    logger.info("✅ test_db_outage_recover PASSED")


    # ------------------------------------------------------------------
    # STEP 3A: Stop Postgres (simulate outage)
    # ------------------------------------------------------------------
    logger.info("⛔ Stopping Postgres…")
    compose.safe_stop("iot-postgis")
    time.sleep(3)

    # ------------------------------------------------------------------
    # STEP 3B: Send updates while DB is DOWN
    # ------------------------------------------------------------------
    second_update = OrionRequestData(
        name="recover2",
        service="test",
        subservice="/recover",
        # correct subscription already exist
        subscriptions={
            "historic": {
                "description": "Test:HISTORIC:recover_test",
                "status": "active",
                "subject": {
                    "entities": [{"idPattern": ".*", "type": "FAIL"}],
                    "condition": {"attrs": ["TimeInstant"]}
                },
                "notification": {
                    "kafkaCustom": {
                        "url": "kafka://kafka:29092",
                        "topic": "smc_raw_historic"
                    },
                    "attrs": ["TimeInstant", "temperature"]
                }
            }
        },
        updateEntities=[
            {
                "id": "E3",
                "type": "Test",
                "TimeInstant": {"type": "DateTime", "value": "2025-06-26T13:00:00Z"},
                "temperature": {"value": 3.0, "type": "Float"},
            },
            {
                "id": "FAIL",
                "type": "FAIL",
                "TimeInstant": {"type": "DateTime", "value": "2025-06-26T12:00:00Z"},
                "temperature": {"value": 2.0, "type": "Float"},
            }
        ]
    )

    ops = ServiceOperations(multiservice_stack, [second_update])
    ops.orion_set_up()

    # Give time for connector to fail
    time.sleep(TIMEOUT_DB_RECOVERY)

    # ------------------------------------------------------------------
    # STEP 3C: Start Postgres again
    # ------------------------------------------------------------------
    logger.info("🟢 Starting Postgres…")
    compose.safe_start("iot-postgis")
    time.sleep(5)

    # ------------------------------------------------------------------
    # STEP 3D: Wait for connector task recovery
    # ------------------------------------------------------------------
    for connector_name in (
        "jdbc-historical-sink",
        "jdbc-lastdata-sink",
        "jdbc-mutable-sink",
    ):
        wait_for_connector(
            name=connector_name,
            url=f"http://{multiservice_stack.kafkaConnectHost}:{multiservice_stack.KafkaConnectPort}"
        )

    # ------------------------------------------------------------------
    # STEP 3E: Validate final DB state (E1, E2, E3)
    # ------------------------------------------------------------------
    validator = PostgisValidator(DEFAULT_DB_CONFIG)

    expected_rows = [{"entityid": "E1"}, {"entityid": "E2"}, {"entityid": "E3"}]

    for table in [
        "test.recover_test",
        "test.recover_test_lastdata",
        "test.recover_test_mutable",
    ]:
        ok = validator.validate(table, expected_rows, timeout=60)
        assert ok, f"❌ Not all entities were persisted in {table}"

    # Produce a fresh invalid record after recovery so the DLQ-to-error-log
    # assertion does not depend on the error sink writing while Postgres is down.
    recovered_error = OrionRequestData(
        name="recover_error_log",
        service="test",
        subservice="/recover",
        subscriptions={},
        updateEntities=[{
            "id": "FAIL_AFTER_RECOVERY",
            "type": "FAIL",
            "TimeInstant": {"type": "DateTime", "value": "2025-06-26T14:00:00Z"},
            "temperature": {"value": 4.0, "type": "Float"}
        }]
    )
    ServiceOperations(multiservice_stack, [recovered_error]).orion_set_up()

    recovered_type_error = OrionRequestData(
        name="recover_invalid_type",
        service="test",
        subservice="/recover",
        subscriptions={},
        updateEntities=[{
            "id": "INVALID_TYPE_AFTER_RECOVERY",
            "type": "Test",
            "TimeInstant": {"type": "DateTime", "value": "2025-06-26T14:05:00Z"},
            "temperature": {"value": "not-a-number", "type": "Text"}
        }]
    )
    ServiceOperations(multiservice_stack, [recovered_type_error]).orion_set_up()

    error_row = {
        "error": { "contains": "Table \"tests\".\"test\".\"recover_fail\" is missing"}
    }
    ok = validator.wait_until_row_present("test.test_error_log", error_row, timeout=60)
    assert ok, f"❌ FAIL entity should not be present in {table}"

    type_error_row = {
        "error": {"contains": 'column "temperature" is of type double precision but expression is of type character varying'}
    }
    ok = validator.wait_until_row_present("test.test_error_log", type_error_row, timeout=60)
    assert ok, "❌ Invalid temperature type after recovery was not logged"

    logger.info("✅ test_db_outage_recover PASSED")
