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
from pathlib import Path

from common.common_test import OrionRequestData, ServiceOperations
from common.utils.kafnus_connect_loader import deploy_all_sinks
from common.config import logger, DEFAULT_DB_CONFIG
from common.utils.sql_runner import execute_sql_file
from common.utils.postgis_validator import PostgisValidator
from common.utils.wait_services import wait_for_kafnus_connect, wait_for_connector

from datetime import datetime, timedelta

BATCH_SIZE = 10

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
    orion_request = OrionRequestData(
        name="batch_backlog",
        service="test",
        subservice="/batch",
        subscriptions={
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
            }
        },
        updateEntities=generate_entities(BATCH_SIZE)
    )

    ops = ServiceOperations(multiservice_stack, [orion_request])
    ops.orion_set_up()

    time.sleep(10)  # give some time for the messages to be in Kafka

    # 3. Start Kafnus NGSI
    logger.info("▶ Starting kafnus-ngsi")
    compose.safe_start("kafnus-ngsi")
    t0 = time.time()
    # Check that last messages have been processed
    # ...
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
    # ...
    t_connect = time.time() - t1

    logger.info(f"⏱ JDBC persistence time: {t_connect:.2f}s")

    time.sleep(10)

    # 5. Validate that entities have been correctly stored in PostGIS
    validator = PostgisValidator(DEFAULT_DB_CONFIG)

    sample = [
        {"entityid": "E0"},
        {"entityid": f"E{BATCH_SIZE // 2}"},
        {"entityid": f"E{BATCH_SIZE - 1}"}
    ]

    ok = validator.validate("test.batch_test", sample)
    assert ok, "❌ Batch backlog processing failed"

    logger.info("✅ JDBC batch backlog test PASSED")

def generate_entities(count, start_ts=None):
    if start_ts is None:
        start_ts = datetime.utcnow()
    
    entities = []
    for i in range(count):
        timeinstant = (start_ts + timedelta(seconds=i)).isoformat() + "Z"
        entities.append({
            "id": f"E{i}",
            "type": "Test",
            "TimeInstant": {
                "type": "DateTime",
                "value": timeinstant
            },
            "temperature": {
                "type": "Float",
                "value": float(i)
            }
        })
    return entities