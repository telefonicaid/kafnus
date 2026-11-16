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
import json
import requests
from pathlib import Path
from confluent_kafka import Consumer

from common.common_test import OrionRequestData, ServiceOperations
from common.utils.kafnus_connect_loader import deploy_all_sinks
from common.config import logger, DEFAULT_DB_CONFIG
from common.utils.sql_runner import execute_sql_file
from common.utils.postgis_validator import PostgisValidator
from common.utils.utils import find_subscription_id_by_description
from common.utils.wait_services import wait_for_kafnus_connect, wait_for_connector

from datetime import datetime, timedelta

BATCH_SIZE = 3000 * 4 # Must be multiple of 4
SENTINEL_ID = "__END__"

def test_jdbc_batch_backlog(multiservice_stack):
    """
    Verifies that JDBC sink correctly processes a large backlog of messages,
    implicitly using JDBC batch mechanics.
    """

    logger.info("🧪 Starting JDBC batch backlog test")

    setup_file = Path(__file__).resolve().parent / "setup.sql"
    execute_sql_file(setup_file, db_config=DEFAULT_DB_CONFIG)

    # 1. Get down Kafnus NGSI and Kafnus Connect
    compose = multiservice_stack.compose

    logger.info("⏸ Stopping kafnus-ngsi and kafnus-connect")
    compose.safe_stop("kafnus-ngsi")
    compose.safe_stop("kafnus-connect")

    # 2. Send a large batch of entities to Orion Context Broker
    start_ts = datetime.utcnow()
    
    # Define subscriptions template to reuse across requests
    subscriptions_template = {
        "historic": {
            "description": "Test:HISTORIC:batch_test",
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
            "description": "Test:LASTDATA:batch_test",
            "status": "active",
            "subject": {
                "entities": [{"idPattern": ".*", "type": "Test"}]
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
            "description": "Test:MUTABLE:batch_test",
            "status": "active",
            "subject": {
                "entities": [{"idPattern": ".*", "type": "Test"}]
            },
            "notification": {
                "kafkaCustom": {
                    "url": "kafka://kafka:29092",
                    "topic": "smc_raw_mutable"
                },
                "attrs": ["TimeInstant", "temperature"]
            }
        },
    }
    
    # First quarter: 1 entity (index 0)
    orion_request = OrionRequestData(
        name="batch_backlog",
        service="test",
        subservice="/batch",
        subscriptions=subscriptions_template,
        updateEntities=generate_entities(BATCH_SIZE//4, start_ts=start_ts, start_index=0)
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    # Second quarter: 1 entity (index 1)
    orion_request = OrionRequestData(
        name="batch2_backlog",
        service="test",
        subservice="/batch2",
        subscriptions=subscriptions_template,
        updateEntities=generate_entities(BATCH_SIZE//4, start_ts=start_ts, start_index=BATCH_SIZE//4)
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    # Third quarter: 1 entity (index 2)
    orion_request = OrionRequestData(
        name="batch3_backlog",
        service="test",
        subservice="/batch",
        subscriptions={},
        updateEntities=generate_entities(BATCH_SIZE//4, start_ts=start_ts, start_index=BATCH_SIZE//2)
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    # Keep one invalid subservice case to verify routing errors.
    orion_request = OrionRequestData(
        name="wrong_subservice",
        service="test",
        subservice="/errorFAIL",
        subscriptions={
            "historic": {
                "description": "Test:HISTORIC:error_test",
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
        }},
        updateEntities=[{
            "id": "error_entity",
            "type": "Test",
            "TimeInstant": {
                "type": "DateTime",
                "value": datetime.utcnow().isoformat() + "Z"
            },
            "temperature": {
                "type": "Float",
                "value": -1.0
            }
        }]
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    # Reuse an existing key on a dedicated route to trigger the primary key.
    orion_request = OrionRequestData(
        name="duplicate_key",
        service="test",
        subservice="/duplicate_key",
        subscriptions={
            "historic": {
                "description": "Test:HISTORIC:duplicate_key_test",
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
            }
        },
        updateEntities=[{
            "id": "duplicate_error",
            "type": "Test",
            "TimeInstant": {
                "type": "DateTime",
                "value": "2030-01-01T00:00:00Z"
            },
            "temperature": {
                "type": "Float",
                "value": 9999.0
            }
        }]
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    # Include a required field that has no matching column in the destination table.
    orion_request = OrionRequestData(
        name="missing_column",
        service="test",
        subservice="/missing_column",
        subscriptions={
            "historic": {
                "description": "Test:HISTORIC:missing_column_test",
                "status": "active",
                "subject": {
                    "entities": [{"idPattern": "missing_column_entity", "type": "Test"}],
                    "condition": {"attrs": ["TimeInstant"]}
                },
                "notification": {
                    "kafkaCustom": {
                        "url": "kafka://kafka:29092",
                        "topic": "smc_raw_historic"
                    },
                    "attrs": ["TimeInstant", "temperature", "missing_column"]
                }
            }
        },
        updateEntities=[{
            "id": "missing_column_entity",
            "type": "Test",
            "TimeInstant": {
                "type": "DateTime",
                "value": (start_ts + timedelta(days=1)).isoformat() + "Z"
            },
            "temperature": {
                "type": "Float",
                "value": -2.0
            },
            "missing_column": {
                "type": "Text",
                "value": "not present in batch_test"
            }
        }]
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    orion_request = OrionRequestData(
        name="invalid_type",
        service="test",
        subservice="/invalid_type",
        subscriptions={
            "historic": {
                "description": "Test:HISTORIC:invalid_type_test",
                "status": "active",
                "subject": {
                    "entities": [{"idPattern": "invalid_type_entity", "type": "Test"}],
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
        updateEntities=[{
            "id": "invalid_type_entity",
            "type": "Test",
            "TimeInstant": {
                "type": "DateTime",
                "value": (start_ts + timedelta(days=2)).isoformat() + "Z"
            },
            "temperature": {
                "type": "Text",
                "value": "not-a-number"
            }
        }]
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    # Fourth quarter: 1 entity (index 3)
    orion_request = OrionRequestData(
        name="batch4_backlog",
        service="test",
        subservice="/batch2",
        subscriptions={},
        updateEntities=generate_entities(BATCH_SIZE//4, start_ts=start_ts, start_index=3*(BATCH_SIZE//4))
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    latest_timeinstant = start_ts + timedelta(days=3)
    latest_timeinstant_iso = latest_timeinstant.isoformat() + "Z"
    orion_request = OrionRequestData(
        name="batch_lastdata_update",
        service="test",
        subservice="/batch",
        subscriptions={},
        updateEntities=[{
            "id": "E0",
            "type": "Test",
            "TimeInstant": {"type": "DateTime", "value": latest_timeinstant_iso},
            "temperature": {"type": "Float", "value": 99999.0}
        }]
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    orion_request = OrionRequestData(
        name="batch_backlog",
        service="test",
        subservice="/sentinel",
        subscriptions=sentinel_subscriptions(multiservice_stack),
        updateEntities=[{
            "id": SENTINEL_ID,
            "type": "Test",
            "TimeInstant": {
                "type": "DateTime",
                "value": datetime.utcnow().isoformat() + "Z"
            },
            "temperature": {
                "type": "Float",
                "value": -1.0
            }
        }]
    )
    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    # 3. Start Kafnus NGSI
    logger.info("▶ Starting kafnus-ngsi")
    compose.safe_start("kafnus-ngsi")
    logger.info("Started kafnus-ngsi. Waiting for backlog processing...")
    t0 = time.time()
    # Check that last messages have been processed
    assert wait_for_ngsi_sentinel(
        kafka_bootstrap=f"{multiservice_stack.kafkaHost}:{multiservice_stack.kafkaPort}",
        sentinel_id=SENTINEL_ID,
        topic="smc_test_historic_processed",
        timeout=90
    ), "❌ kafnus-ngsi did not process all backlog"
    t_ngsi = time.time() - t0
    logger.info(f"⏱ NGSI processing time: {t_ngsi:.2f}s")

    # 4. Start Kafnus Connect and wait for backlog to be processed
    logger.info("▶ Starting kafnus-connect")
    compose.safe_start("kafnus-connect")
    wait_for_kafnus_connect()
    sinks_dir = Path(__file__).resolve().parent.parent / "sinks"
    deploy_all_sinks(sinks_dir)
    wait_for_connector(
        name="jdbc-historical-sink",
        url=f"http://{multiservice_stack.kafkaConnectHost}:{multiservice_stack.KafkaConnectPort}"
    )
    t1 = time.time()
    # Check that last messages have been persisted
    validator = PostgisValidator(DEFAULT_DB_CONFIG)
    assert validator.wait_until_row_present(
        "test.sentinel_test",
        {"entityid": SENTINEL_ID},
        timeout=180
    ), "❌ kafnus-connect did not persist sentinel"
    t_connect = time.time() - t1

    logger.info(f"⏱ JDBC persistence time: {t_connect:.2f}s")

    # 5. Validate that entities have been correctly stored in PostGIS
    expected_rows_batch = BATCH_SIZE//2 + 1
    expected_rows_batch2 = BATCH_SIZE//2
    rows = validator.count_rows("test.batch_test")
    assert rows == expected_rows_batch, (
        f"❌ Expected {expected_rows_batch} rows, found {rows}"
    )

    rows = validator.count_rows("test.batch2_test")
    assert rows == expected_rows_batch2, (
        f"❌ Expected {expected_rows_batch2} rows, found {rows}"
    )

    lastdata_rows = validator.wait_for_row_count("test.batch_test_lastdata", expected_rows_batch2, timeout=180)
    assert lastdata_rows == expected_rows_batch2, (
        f"❌ Expected {expected_rows_batch2} lastdata rows for /batch, found {lastdata_rows}"
    )

    lastdata_rows = validator.wait_for_row_count("test.batch2_test_lastdata", expected_rows_batch2, timeout=180)
    assert lastdata_rows == expected_rows_batch2, (
        f"❌ Expected {expected_rows_batch2} lastdata rows for /batch2, found {lastdata_rows}"
    )

    assert validator.validate(
        "test.batch_test_lastdata",
        [{"entityid": "E0", "timeinstant": latest_timeinstant_iso, "temperature": 99999.0}],
        timeout=180
    ), "❌ Lastdata did not retain the most recent E0 values"

    assert validator.wait_until_row_present(
        "test.test_error_log",
        {"error": {"contains": 'Table "tests"."test"."errorfail_test" is missing and auto-creation is disabled'}},
        timeout=180
    ), "❌ Invalid subservice routing error was not logged"
    assert validator.wait_until_row_present(
        "test.test_error_log",
        {"error": {"contains": 'duplicate key value violates unique constraint "duplicate_key_test_pkey"'}},
        timeout=180
    ), "❌ Duplicate key insertion error was not logged"
    assert validator.wait_until_row_present(
        "test.test_error_log",
        {"error": {"contains": 'Cannot ALTER TABLE "tests"."test"."missing_column_test" to add missing field'}},
        timeout=180
    ), "❌ Missing column insertion error was not logged"
    assert validator.wait_until_row_present(
        "test.test_error_log",
        {"error": {"contains": 'column "temperature" is of type double precision but expression is of type character varying'}},
        timeout=180
    ), "❌ Invalid temperature type error was not logged"

    expected_ids_batch = {
        f"E{(BATCH_SIZE//4)-1}",
        f"E{3*(BATCH_SIZE//4) - 1}"
    }

    expected_ids_batch2 = {
        f"E{(BATCH_SIZE//2)-1}",
        f"E{BATCH_SIZE - 1}"
    }

    for eid in expected_ids_batch:
        assert validator.validate(
            "test.batch_test",
            [{"entityid": eid}]
        ), f"❌ Missing entity {eid}"
        assert validator.validate(
            "test.batch_test_lastdata",
            [{"entityid": eid}]
        ), f"❌ Missing lastdata entity {eid} for /batch"
    
    for eid in expected_ids_batch2:
        assert validator.validate(
            "test.batch2_test",
            [{"entityid": eid}]
        ), f"❌ Missing entity {eid}"
        assert validator.validate(
            "test.batch2_test_lastdata",
            [{"entityid": eid}]
        ), f"❌ Missing lastdata entity {eid} for /batch2"

    logger.info("✅ JDBC batch backlog test PASSED")

def test_jdbc_batch_failure_shares_execute_batch(multiservice_stack):
    """Verify what happens to valid rows sharing a JDBC batch with a bad row."""
    setup_file = Path(__file__).resolve().parent / "setup.sql"
    execute_sql_file(setup_file, db_config=DEFAULT_DB_CONFIG)

    compose = multiservice_stack.compose
    connect_url = (
        f"http://{multiservice_stack.kafkaConnectHost}:"
        f"{multiservice_stack.KafkaConnectPort}"
    )
    config_url = f"{connect_url}/connectors/jdbc-historical-sink/config"
    config_response = requests.get(config_url, timeout=10)
    config_response.raise_for_status()
    original_config = config_response.json()

    batch_config = {**original_config, "batch.size": "3"}
    update_response = requests.put(config_url, json=batch_config, timeout=10)
    update_response.raise_for_status()

    try:
        wait_for_connector(
            name="jdbc-historical-sink",
            url=connect_url
        )
        compose.safe_stop("kafnus-ngsi")
        compose.safe_stop("kafnus-connect")

        same_table_update = OrionRequestData(
            name="same_batch_records",
            service="test",
            subservice="/same_batch",
            subscriptions={
                "historic": {
                    "description": "Test:HISTORIC:same_batch_atomicity",
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
                }
            },
            updateEntities=[
                {
                    "id": "same_batch_before",
                    "type": "Test",
                    "TimeInstant": {"type": "DateTime", "value": "2031-01-01T00:00:01Z"},
                    "temperature": {"type": "Float", "value": 10.0}
                },
                {
                    "id": "same_batch_duplicate",
                    "type": "Test",
                    "TimeInstant": {"type": "DateTime", "value": "2031-01-01T00:00:00Z"},
                    "temperature": {"type": "Float", "value": 20.0}
                },
                {
                    "id": "same_batch_after",
                    "type": "Test",
                    "TimeInstant": {"type": "DateTime", "value": "2031-01-01T00:00:02Z"},
                    "temperature": {"type": "Float", "value": 30.0}
                }
            ]
        )
        ServiceOperations(multiservice_stack, [same_table_update]).orion_set_up()

        sentinel_id = "__SAME_BATCH_END__"
        sentinel_update = OrionRequestData(
            name="same_batch_sentinel",
            service="test",
            subservice="/sentinel",
            subscriptions=sentinel_subscriptions(multiservice_stack),
            updateEntities=[{
                "id": sentinel_id,
                "type": "Test",
                "TimeInstant": {"type": "DateTime", "value": "2031-01-01T00:00:03Z"},
                "temperature": {"type": "Float", "value": 40.0}
            }]
        )
        ServiceOperations(multiservice_stack, [sentinel_update]).orion_set_up()

        compose.safe_start("kafnus-ngsi")
        assert wait_for_ngsi_sentinel(
            kafka_bootstrap=f"{multiservice_stack.kafkaHost}:{multiservice_stack.kafkaPort}",
            sentinel_id=sentinel_id,
            topic="smc_test_historic_processed",
            timeout=90
        ), "❌ Kafnus NGSI did not process the same-batch records and sentinel"

        compose.safe_start("kafnus-connect")
        wait_for_connector(name="jdbc-historical-sink", url=connect_url)
        validator = PostgisValidator(DEFAULT_DB_CONFIG)
        assert validator.wait_until_row_present(
            "test.sentinel_test",
            {"entityid": sentinel_id},
            timeout=180
        ), "❌ JDBC sink did not process the sentinel after the failing batch"

        assert validator.wait_until_row_present(
            "test.test_error_log",
            {"error": {"contains": 'duplicate key value violates unique constraint "same_batch_test_pkey"'}},
            timeout=180
        ), "❌ Same-batch duplicate key error was not logged"

        persisted_ids = {
            entity_id
            for entity_id in ("same_batch_before", "same_batch_after")
            if validator.validate("test.same_batch_test", [{"entityid": entity_id}], timeout=1)
        }
        logger.info("Rows persisted from the batch containing a duplicate key: %s", persisted_ids)
        assert persisted_ids == {"same_batch_before", "same_batch_after"}, (
            "Expected valid rows surrounding the duplicate to persist; "
            f"found {persisted_ids}"
        )
        assert validator.count_rows("test.same_batch_test") == 3, (
            "Expected the seeded duplicate row and two valid rows; the duplicate "
            "insert itself must not persist"
        )
    finally:
        compose.safe_start("kafnus-ngsi")
        compose.safe_start("kafnus-connect")
        wait_for_kafnus_connect()
        restore_response = requests.put(config_url, json=original_config, timeout=10)
        restore_response.raise_for_status()
        wait_for_connector(name="jdbc-historical-sink", url=connect_url)

def sentinel_subscriptions(multiservice_stack):
    orion_url = f"http://{multiservice_stack.orionHost}:{multiservice_stack.orionPort}/v2"
    description = "Test:HISTORIC:sentinel_test"
    if find_subscription_id_by_description(
        orion_url,
        description,
        {"Fiware-Service": "test", "Fiware-ServicePath": "/sentinel"}
    ):
        return {}
    return {
        "historic": {
            "description": description,
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
        }
    }

def generate_entities(count, start_ts=None, start_index=0):
    if start_ts is None:
        start_ts = datetime.utcnow()
    
    entities = []
    for i in range(count):
        timeinstant = (start_ts + timedelta(seconds=i+start_index)).isoformat() + "Z"
        entities.append({
            "id": f"E{i+start_index}",
            "type": "Test",
            "TimeInstant": {
                "type": "DateTime",
                "value": timeinstant
            },
            "temperature": {
                "type": "Float",
                "value": float(i+start_index)
            }
        })
    return entities

def wait_for_ngsi_sentinel(
    kafka_bootstrap,
    sentinel_id,
    topic,
    timeout=60
):
    consumer = Consumer({
        "bootstrap.servers": kafka_bootstrap,
        "group.id": f"ngsi-sentinel-{int(time.time())}",
        "auto.offset.reset": "earliest",
    })

    consumer.subscribe([topic])
    start = time.time()

    try:
        while time.time() - start < timeout:
            msg = consumer.poll(2.0)
            if msg is None or msg.error():
                continue

            payload = json.loads(msg.value())
            entity_id = payload.get("entityid") or payload.get("payload", {}).get("entityid")

            if entity_id == sentinel_id:
                logger.info("✅ NGSI sentinel processed")
                return True
    finally:
        consumer.close()

    return False
