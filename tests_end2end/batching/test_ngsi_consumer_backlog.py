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

import os
import time
import json
from datetime import datetime, timedelta
from pathlib import Path
from confluent_kafka import Consumer

from common.common_test import OrionRequestData, ServiceOperations
from common.config import logger, DEFAULT_DB_CONFIG
from common.utils.sql_runner import execute_sql_file

DEFAULT_NOTIF_COUNT = 1000
SENTINEL_ID = "__END__"
RAW_TOPIC = "smc_raw_historic"
PROCESSED_TOPIC = "smc_test_historic_processed"

def test_ngsi_consumer_backlog(multiservice_stack):
    """
    Stress consumer queue of kafnus-ngsi:
    - Stop kafnus-ngsi
    - Generates N notifications (backlog) in RAW topic
    - Send a sentinel signal
    - Start kafnus-ngsi
    - Check all is processed when sentinel is in PROCESSED topic
    """

    notif_count = int(os.getenv("NGSI_BACKLOG_NOTIF_COUNT", DEFAULT_NOTIF_COUNT))

    compose = multiservice_stack.compose
    logger.info(f"🧪 Starting NGSI consumer backlog test: N={notif_count}")
    logger.info(f"Kafka bootstrap used by test consumer: {multiservice_stack.kafkaHost}:{multiservice_stack.kafkaPort}")
    # 0) Prepare tables in DB for test
    setup_file = Path(__file__).resolve().parent / "setup.sql"
    execute_sql_file(setup_file, db_config=DEFAULT_DB_CONFIG)

    # 1) Stops kafnus-ngsi to acumulate in backlog
    logger.info("⏸ Stopping kafnus-ngsi to build backlog")
    compose.safe_stop("kafnus-ngsi")

    start_ts = datetime.utcnow()

    # Subscription to Kafka RAW (which consumes kafnus-ngsi)
    subscriptions = {
        "historic": {
            "description": f"Test:HISTORIC:ngsi_backlog_{notif_count}",
            "status": "active",
            "subject": {
                "entities": [{"idPattern": ".*", "type": "Test"}],
                "condition": {"attrs": ["TimeInstant"]}  # force notification in each update
            },
            "notification": {
                "kafkaCustom": {
                    "url": "kafka://kafka:29092",
                    "topic": RAW_TOPIC
                },
                # adds a counter to allow check it
                "attrs": ["TimeInstant", "temperature", "seq"]
            }
        }
    }

    # 2) Send N updates which generates N RAW notifications 
    #    (all similar, only changes TimeInstant/seq)
    updates = []
    for i in range(notif_count):
        ti = (start_ts + timedelta(milliseconds=i)).isoformat() + "Z"
        updates.append({
            "id": f"E{i}",
            "type": "Test",
            "TimeInstant": {"type": "DateTime", "value": ti},
            "temperature": {"type": "Float", "value": 1.0},
            "seq": {"type": "Integer", "value": i},
        })

    # 2a) Crate subscription and put into Orion backlog
    t_send0 = time.time()
    BATCH = int(os.getenv("NGSI_UPDATE_BATCH", "100"))  # ajusta
    for i in range(0, len(updates), BATCH):
        batch = updates[i:i+BATCH]
        orion_request = OrionRequestData(
            name=f"ngsi_backlog_setup_{i//BATCH}",
            service="test",
            subservice="/ngsi_backlog",
            subscriptions=subscriptions if i == 0 else {},
            updateEntities=batch,
        )
        ops = ServiceOperations(multiservice_stack, [orion_request])
        ops.orion_set_up()

    t_send = time.time() - t_send0
    logger.info(f"📤 Sent {notif_count} updates (and backlog to RAW) in {t_send:.2f}s")

    # 2b) Send sentinel signal at the end (same subscription -> also to RAW)
    sentinel_req = OrionRequestData(
        name="ngsi_backlog_sentinel",
        service="test",
        subservice="/ngsi_backlog",
        subscriptions={},  # no recreate subs
        updateEntities=[{
            "id": SENTINEL_ID,
            "type": "Test",
            "TimeInstant": {"type": "DateTime", "value": datetime.utcnow().isoformat() + "Z"},
            "temperature": {"type": "Float", "value": -1.0},
            "seq": {"type": "Integer", "value": -1},
        }],
    )
    ops = ServiceOperations(multiservice_stack, [sentinel_req])
    ops.orion_set_up()

    # 3) Starts kafnus-ngsi and wait to process  backlog (sentinel in PROCESSED)
    logger.info("▶ Starting kafnus-ngsi")
    compose.safe_start("kafnus-ngsi")

    t0 = time.time()
    ok = wait_for_ngsi_sentinel(
        kafka_bootstrap=f"{multiservice_stack.kafkaHost}:{multiservice_stack.kafkaPort}",
        sentinel_id=SENTINEL_ID,
        topic=PROCESSED_TOPIC,
        timeout=max(90, min(600, notif_count // 5)),
    )
    t_drain = time.time() - t0

    assert ok, "❌ kafnus-ngsi did not process backlog up to sentinel"
    logger.info(f"✅ NGSI drained backlog up to sentinel in {t_drain:.2f}s")


def wait_for_ngsi_sentinel(kafka_bootstrap, sentinel_id, topic, timeout=60):
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
