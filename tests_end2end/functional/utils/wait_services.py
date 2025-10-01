
import json
import requests
import socket
import time
from confluent_kafka import Producer, Consumer, TopicPartition
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from pathlib import Path
from config import logger
from config import KAFNUS_TESTS_KAFNUS_CONNECT_URL, KAFNUS_TESTS_DEFAULT_CONNECTOR_NAME


def wait_for_kafnus_connect(url=KAFNUS_TESTS_KAFNUS_CONNECT_URL, timeout=90):
    """
    Waits until the Kafnus Connect service is available at the given URL.
    Raises an exception if the timeout is exceeded before the service becomes reachable.

    Parameters:
    - url: The Kafnus Connect REST endpoint.
    - timeout: Maximum time to wait in seconds.
    """
    start = time.time()
    while time.time() - start < timeout:
        try:
            res = requests.get(url)
            if res.ok:
                logger.info("✅ Kafnus Connect is available..")
                return
        except requests.exceptions.RequestException:
            pass
        logger.debug("⏳ Waiting for Kafnus Connect...")
        time.sleep(2)
    logger.fatal(f"❌ Kafnus Connect did not respond within {timeout} seconds")

def wait_for_connector(name=KAFNUS_TESTS_DEFAULT_CONNECTOR_NAME, url=KAFNUS_TESTS_KAFNUS_CONNECT_URL, timeout=60):
    """
    Waits for the specified Kafnus Connect connector to reach the RUNNING state.
    Raises an exception if the connector does not become active after multiple attempts.

    Parameters:
    - name: Name of the Kafnus Connect connector.
    - url: Kafnus Connect REST endpoint.
    """
    logger.info(f"⏳ Waiting for connector {name} to reach RUNNING state...")
    for _ in range(timeout // 2):
        try:
            r = requests.get(f"{url}/connectors/{name}/status")
            """if r.status_code == 200 and r.json().get("connector", {}).get("state") == "RUNNING":
                logger.info(f"✅ Connector {name} is RUNNING")
                return"""
            if r.status_code == 200:
                data = r.json()
                if data.get("connector", {}).get("state") == "RUNNING":
                    tasks = data.get("tasks", [])
                    if tasks and all(t["state"] == "RUNNING" for t in tasks):
                        logger.info(f"✅ Connector {name} is RUNNING")
                        return
        except Exception as e:
            logger.warning(f"⚠️ Error querying connector status: {str(e)}")
        time.sleep(2)
    logger.fatal(f"❌ Connector {name} did not reach RUNNING state")
    raise RuntimeError(f"❌ Connector {name} did not reach RUNNING state")

def wait_for_postgres(host, port, timeout=60):
    """
    Wait until the PostgreSQL server is reachable at host:port.
    Raises RuntimeError if it does not become available before timeout.

    Parameters:
    - host (str): PostgreSQL host address
    - port (int): PostgreSQL port
    - timeout (int): Maximum wait time in seconds
    """
    start = time.time()
    while time.time() - start < timeout:
        try:
            with socket.create_connection((host, port), timeout=2):
                logger.info(f"✅ Postgres is up at: {host}:{port}")
                return
        except OSError:
            logger.debug(f"⏳ Waiting for Postgres to be ready at: {host}:{port}...")
            time.sleep(2)
    logger.fatal("❌ Postgres did not become available in time")
    raise RuntimeError("Postgres did not become available in time")

def ensure_postgis_db_ready(KAFNUS_TESTS_PG_HOST, KAFNUS_TESTS_PG_PORT, KAFNUS_TESTS_PG_USER, KAFNUS_TESTS_PG_PASSWORD, db_name='tests'):
    """
    Ensures the PostgreSQL database exists and is ready with PostGIS extension,
    schema, and base tables as defined in an external SQL file.

    Parameters:
    - KAFNUS_TESTS_PG_HOST (str): PostgreSQL host
    - KAFNUS_TESTS_PG_PORT (int): PostgreSQL port
    - KAFNUS_TESTS_PG_USER (str): PostgreSQL username
    - KAFNUS_TESTS_PG_PASSWORD (str): PostgreSQL password
    - db_name (str): Name of the database to create/use
    """
    logger.info(f"🔧 Preparing PostGIS database: {db_name}")

    # Connect to default postgres DB to create target DB if it does not exist
    admin_conn = psycopg2.connect(
        dbname='postgres',
        user=KAFNUS_TESTS_PG_USER,
        password=KAFNUS_TESTS_PG_PASSWORD,
        host=KAFNUS_TESTS_PG_HOST,
        port=KAFNUS_TESTS_PG_PORT
    )
    admin_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    admin_cur = admin_conn.cursor()

    admin_cur.execute(f"SELECT 1 FROM pg_database WHERE datname = '{db_name}';")
    exists = admin_cur.fetchone()
    if not exists:
        logger.debug(f"⚙️ Creating database {db_name}")
        admin_cur.execute(f'CREATE DATABASE {db_name};')
    else:
        logger.debug(f"✅ Database {db_name} already exists")

    admin_cur.close()
    admin_conn.close()

    # Connect to the created DB to apply PostGIS setup using the external SQL file
    db_conn = psycopg2.connect(
        dbname=db_name,
        user=KAFNUS_TESTS_PG_USER,
        password=KAFNUS_TESTS_PG_PASSWORD,
        host=KAFNUS_TESTS_PG_HOST,
        port=KAFNUS_TESTS_PG_PORT
    )
    db_conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    db_cur = db_conn.cursor()

    sql_file_path = Path(__file__).parent / "setup_tests.sql"
    with open(sql_file_path, 'r') as f:
        sql_commands = f.read()
    logger.debug("📥 Applying PostGIS setup from SQL file")
    db_cur.execute(sql_commands)

    logger.debug(f"✅ Database setup complete for {db_name}")
    db_cur.close()
    db_conn.close()

def wait_for_orion(host, port, timeout=60):
    """
    Wait until the Orion Context Broker is reachable at host:port.
    Raises RuntimeError if it does not become available before timeout.
    Parameters:
    - host (str): Orion host address
    - port (int): Orion port
    - timeout (int): Maximum wait time in seconds
    """
    url = f"http://{host}:{port}/version"
    start = time.time()
    while time.time() - start < timeout:
        try:
            r = requests.get(url, timeout=2)
            if r.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError("Orion did not become ready in time")

def wait_for_kafnus_ngsi(kafka_bootstrap="kafka:9092", timeout=300):
    """
    Sends NGSI-like test messages to Kafnus input topics and waits until all
    NGSI agents produce messages on their respective output topics.

    Raises RuntimeError if any agent does not consume and produce a message in time.

    Parameters:
    - kafka_bootstrap: Kafka bootstrap server
    - timeout: Maximum wait time in seconds
    """
    logger.info("Starting NGSI smoke test...")

    # Map input -> expected output
    flows = {
        "raw_mongo": "init_mongo",
        "raw_historic": "init",
        "raw_lastdata": "init_lastdata",
        "raw_mutable": "init_mutable",
        "raw_errors": "init_error_log",
        "raw_sgtr": "sgtr_http"
    }

    # --- Test messages (NGSI notification style) ---
    # --- Shared NGSI-style message ---
    ngsi_msg = {
        "key": "sub1",
        "value": {
            "subscriptionId": "sub1",
            "data": [{
                "id": "Sensor1",
                "type": "Sensor",
                "TimeInstant": {
                    "type": "DateTime",
                    "value": "2025-06-26T11:00:00.000Z",
                    "metadata": {}
                },
                "temperature": {
                    "type": "Float",
                    "value": 25,
                    "metadata": {}
                }
            }]
        }
    }

    # --- Error message ---
    error_msg = {
        "key": "sub_err",
        "value": {
            "timestamp": "2025-09-30T14:00:00Z",
            "error": "init message when starting tests",
            "query": "INSERT INTO ..."
        }
    }

    # --- SGTR-specific message ---
    sgtr_msg = {
        "key": "sgtr1",
        "value": {
            "data": [
                {
                    "alterationType": "entityCreate",
                    "type": "Init",
                    "externalId": "Init:Init"
                }
            ]
        }
    }

    # Topics that reuse the shared NGSI message
    ngsi_inputs = ["raw_historic", "raw_lastdata", "raw_mutable", "raw_mongo"]

    # Common headers required for routing
    headers = [
        ("Fiware-Service", b"init"),
        ("Fiware-ServicePath", b"/init")
    ]

    # --- Produce ---
    producer = Producer({"bootstrap.servers": kafka_bootstrap})
    for topic in ngsi_inputs:
        producer.produce(
            topic,
            key=ngsi_msg["key"],
            value=json.dumps(ngsi_msg["value"]),
            headers=headers
        )
        logger.debug(f"➡️ Sent shared NGSI test message to {topic} with headers {headers}")

    # Error flow separately
    error_headers = [
        ("__connect.errors.topic", b"init"),
        ("__connect.errors.exception.message", b"init message when starting tests"),
        ("__connect.errors.connector.name", b"init"),
        ("target_table", b"init")
    ]
    producer.produce(
        "raw_errors",
        key=error_msg["key"],
        value=json.dumps(error_msg["value"]),
        headers=error_headers
    )
    logger.debug(f"➡️ Sent initial error message to raw_errors with headers {error_headers}")

    # SGTR flow separately
    sgtr_headers = [
        ("Fiware-Service", b"init"),
        ("Fiware-ServicePath", b"/init")
    ]

    producer.produce(
        "raw_sgtr",
        key=sgtr_msg["key"],
        value=json.dumps(sgtr_msg["value"]),
        headers=sgtr_headers
    )
    logger.debug(f"➡️ Sent SGTR test message to raw_sgtr with headers {sgtr_headers}")

    producer.flush()

    # --- Consume and validate ---
    try:
        consumer = Consumer({
            "bootstrap.servers": kafka_bootstrap,
            "group.id": "ngsi_smoke_test",
            "auto.offset.reset": "earliest",
        })
        
        partitions = [TopicPartition(t, 0) for t in flows.values()]
        consumer.assign(partitions)
        logger.debug(f"Assigned to topics: {[p.topic for p in partitions]}")

        processed = {}
        start = time.time()

        while time.time() - start < timeout and len(processed) < len(flows):
            # Consume multiple messages per iteration
            msgs = consumer.consume(num_messages=6, timeout=2.0)
            if not msgs:
                continue

            for msg in msgs:
                if msg is None or msg.error():
                    continue

                topic = msg.topic()
                val = json.loads(msg.value())
                logger.debug(f"✅ Got message from {topic}: {val}")

                # Minimal validations per flow
                if topic == flows["raw_errors"]:
                    if "payload" in val and "error" in val["payload"]:
                        processed[topic] = True
                elif topic == flows["raw_mongo"]:
                    if "entityId" in val:
                        processed[topic] = True
                elif topic == flows["raw_sgtr"]:
                    if "query" in val:
                        processed[topic] = True
                else:
                    if "payload" in val:
                        processed[topic] = True

            still_missing = set(flows.values()) - set(processed.keys())
            if still_missing:
                logger.debug(f"⏳ Still waiting for: {still_missing}")

    finally:
        consumer.close()

    missing = set(flows.values()) - set(processed.keys())
    if missing:
        logger.fatal(f"❌ NGSI did not produce messages for: {missing}")
        raise RuntimeError(f"NGSI not ready: {missing}")

    logger.info("🎉 All NGSI agents processed test messages correctly")