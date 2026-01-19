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
import time
import pytest
import json
from pathlib import Path
from confluent_kafka import Consumer

from common.common_test import OrionRequestData, ServiceOperations
from common.utils.kafnus_connect_loader import deploy_all_sinks
from common.config import logger, DEFAULT_DB_CONFIG
from common.utils.sql_runner import execute_sql_file
from common.utils.postgis_validator import PostgisValidator
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

    orion_request = OrionRequestData(
        name="batch_backlog",
        service="test",
        subservice="/sentinel",
        subscriptions={
            "historic": {
            "description": "Test:HISTORIC:sentinel_test",
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
    expected_rows = BATCH_SIZE//2
    rows = validator.count_rows("test.batch_test")
    assert rows == expected_rows, (
        f"❌ Expected {expected_rows} rows, found {rows}"
    )

    rows = validator.count_rows("test.batch2_test")
    assert rows == expected_rows, (
        f"❌ Expected {expected_rows} rows, found {rows}"
    )

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
    
    for eid in expected_ids_batch2:
        assert validator.validate(
            "test.batch2_test",
            [{"entityid": eid}]
        ), f"❌ Missing entity {eid}"

    logger.info("✅ JDBC batch backlog test PASSED")

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
