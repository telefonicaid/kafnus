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

import json
from pathlib import Path
from dataclasses import dataclass
from typing import List, Dict, Union
import pytest
import requests
#from testcontainers.compose import DockerCompose
from testcontainers.compose import DockerCompose as OriginalDockerCompose
import subprocess
import os
from utils.kafka_connect_loader import deploy_all_sinks
import socket
import time
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

from config import logger
from config import KAFNUS_TESTS_KAFKA_CONNECT_URL

def wait_for_kafka_connect(url=KAFNUS_TESTS_KAFKA_CONNECT_URL, timeout=60):
    """
    Waits until the Kafka Connect service is available at the given URL.
    Raises an exception if the timeout is exceeded before the service becomes reachable.

    Parameters:
    - url: The Kafka Connect REST endpoint.
    - timeout: Maximum time to wait in seconds.
    """
    start = time.time()
    while time.time() - start < timeout:
        try:
            res = requests.get(url)
            if res.ok:
                logger.info("✅ Kafka Connect is available.")
                return
        except requests.exceptions.RequestException:
            pass
        logger.debug("⏳ Waiting for Kafka Connect...")
        time.sleep(2)
    logger.fatal(f"❌ Kafka Connect did not respond within {timeout} seconds")
    raise RuntimeError("❌ Kafka Connect did not respond within the expected time.")

def wait_for_connector(name="mosquitto-source-connector", url=KAFNUS_TESTS_KAFKA_CONNECT_URL):
    """
    Waits for the specified Kafka Connect connector to reach the RUNNING state.
    Raises an exception if the connector does not become active after multiple attempts.

    Parameters:
    - name: Name of the Kafka Connect connector.
    - url: Kafka Connect REST endpoint.
    """
    logger.info(f"⏳ Waiting for connector {name} to reach RUNNING state...")
    for _ in range(30):
        try:
            r = requests.get(f"{url}/connectors/{name}/status")
            if r.status_code == 200 and r.json().get("connector", {}).get("state") == "RUNNING":
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

# ──────────────────────────────
# Utilidades
# ──────────────────────────────

def read_files(file_path: Path):
    """
    Loads and returns the contents of a JSON file from the specified path.
    Raises an exception if the file does not exist or cannot be read.

    Parameters:
    - file_path: Path to the JSON file.

    Returns:
    - Parsed JSON content.
    """
    try:
        with file_path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError as exc:
        raise Exception(f"the file {file_path} does not exist") from exc


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

# ──────────────────────────────
# Data classes
# ──────────────────────────────

@dataclass
class MultiServiceContainer:
    orionHost: str
    orionPort: str
    kafkaHost: str
    kafkaPort: str
    kafkaConnectHost: str
    KafkaConnectPort: str


@dataclass
class OrionRequestData:
    name: str
    service: str
    subservice: str
    subscriptions: dict
    updateEntities: list


@dataclass
class KafkaMessages:
    topic: str
    headers: dict
    message: dict


# ──────────────────────────────
# Testcontainers Fixture
# ──────────────────────────────


class DockerCompose(OriginalDockerCompose):
    """
    This subclass overrides the original Testcontainers DockerCompose class
    to use the newer Docker Compose V2 CLI ("docker compose") instead of
    the default Docker Compose V1 CLI ("docker-compose") which Testcontainers
    uses by default. This ensures compatibility with the latest Docker CLI,
    improving command support and avoiding deprecated syntax.
    """
    def __init__(self, filepath: str, compose_file_name: Union[str, List[str]] = "docker-compose.yml", **kwargs):
        if isinstance(compose_file_name, str):
            compose_file_name = [compose_file_name]
        self.compose_file_name = compose_file_name
        super().__init__(filepath, compose_file_name=compose_file_name, **kwargs)
    
    def _call_command(self, cmd: List[str]) -> None:
        """Override to use docker compose instead of docker-compose"""
        if cmd and cmd[0] == "docker-compose":
            cmd = ["docker", "compose"] + cmd[1:]
        super()._call_command(cmd)
    
    def _build_compose_command(self, subcommand: str) -> List[str]:
        """Build a docker compose command with all compose files"""
        cmd = ["docker", "compose"]
        for compose_file in self.compose_file_name:
            cmd.extend(["-f", str(Path(self.filepath) / compose_file)])
        cmd.append(subcommand)
        return cmd
    
    def _wait_for_service(self, service_name: str, port: int, timeout: int = 30):
        """Wait until the service is responding to port queries"""
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                cmd = self._build_compose_command("port")
                cmd.extend([service_name, str(port)])
                subprocess.check_output(cmd, cwd=self.filepath, stderr=subprocess.PIPE)
                return True
            except subprocess.CalledProcessError:
                time.sleep(1)
        return False
    
    def get_service_host(self, service_name: str, port: int) -> str:
        if not self._wait_for_service(service_name, port):
            raise RuntimeError(f"Service {service_name} port {port} not available after waiting")
        
        port_cmd = self._build_compose_command("port")
        port_cmd.extend([service_name, str(port)])
        
        try:
            output = subprocess.check_output(port_cmd, cwd=self.filepath).decode("utf-8")
            return output.split(":")[0].strip()
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Failed to get service host for {service_name}:{port}. Is the service running and the port exposed?") from e
    
    def get_service_port(self, service_name: str, port: int) -> int:
        if not self._wait_for_service(service_name, port):
            raise RuntimeError(f"Service {service_name} port {port} not available after waiting")
        
        port_cmd = self._build_compose_command("port")
        port_cmd.extend([service_name, str(port)])
        
        try:
            output = subprocess.check_output(port_cmd, cwd=self.filepath).decode("utf-8")
            return int(output.split(":")[1].strip())
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Failed to get service port for {service_name}:{port}") from e
        except (IndexError, ValueError) as e:
            raise RuntimeError(f"Unexpected output format from docker compose port command") from e
    

@pytest.fixture(scope="session")
def multiservice_stack():
    """
    Pytest fixture that deploys a multi-service environment using Testcontainers.
    This includes Orion, Kafka, Kafka-Connect, Faust, and optionally PostGIS.

    It also deploys the required Kafka connectors and waits for them to become active.
    
    Returns:
    - A MultiServiceContainer object with network configurations for each service.
    """
    docker_dir = Path(__file__).resolve().parent.parent.parent / "docker"

    # If the KAFNUS_TESTS_USE_EXTERNAL_POSTGIS env var is set to "false",
    # the test will deploy a postgis container.
    use_external_pg = os.getenv("KAFNUS_TESTS_USE_EXTERNAL_POSTGIS", "false").lower() == "true"

    compose_files = [
        "docker-compose.kafka.yml",
        "docker-compose.orion.yml",
        "docker-compose.faust.yml"
    ]

    if not use_external_pg:
        compose_files.append("docker-compose.postgis.yml")

    with DockerCompose(str(docker_dir), compose_file_name=compose_files) as compose:
        orion_host = compose.get_service_host("orion", 1026)
        orion_port = compose.get_service_port("orion", 1026)

        kafka_host = compose.get_service_host("kafka", 9092)
        kafka_port = compose.get_service_port("kafka", 9092)

        kafka_connect_host = compose.get_service_host("kafka-connect", 8083)
        kafka_connect_port = compose.get_service_port("kafka-connect", 8083)

        logger.info("✅ Services successfully deployed")

        sinks_dir = Path(__file__).resolve().parent.parent.parent / "sinks"
        logger.debug(f"📂 sinks_dir path: {sinks_dir}")
        logger.debug(f"📁 Files found: {[f.name for f in sinks_dir.glob('*')]}")

        # Setup PostgreSQL DB with PostGIS extension
        KAFNUS_TESTS_PG_HOST = os.getenv("KAFNUS_TESTS_PG_HOST", "localhost")
        KAFNUS_TESTS_PG_PORT = int(os.getenv("KAFNUS_TESTS_PG_PORT", "5432"))
        KAFNUS_TESTS_PG_USER = os.getenv("KAFNUS_TESTS_PG_USER", "postgres")
        KAFNUS_TESTS_PG_PASSWORD = os.getenv("KAFNUS_TESTS_PG_PASSWORD", "postgres")

        wait_for_postgres(KAFNUS_TESTS_PG_HOST, KAFNUS_TESTS_PG_PORT)
        ensure_postgis_db_ready(KAFNUS_TESTS_PG_HOST, KAFNUS_TESTS_PG_PORT, KAFNUS_TESTS_PG_USER, KAFNUS_TESTS_PG_PASSWORD)
        
        wait_for_kafka_connect()
        logger.info("🚀 Deploying sinks...")
        deploy_all_sinks(sinks_dir)
        wait_for_connector()
        time.sleep(1)

        yield MultiServiceContainer(
            orionHost=orion_host,
            orionPort=orion_port,
            kafkaHost=kafka_host,
            kafkaPort=kafka_port,
            kafkaConnectHost=kafka_connect_host,
            KafkaConnectPort=kafka_connect_port
        )

        # If the KAFNUS_TESTS_E2E_MANUAL_INSPECTION env var is set to "true", the test will pause
        # before stopping containers, to allow manual inspection.
        if os.getenv("KAFNUS_TESTS_E2E_MANUAL_INSPECTION", "false").lower() == "true":
            logger.info("🧪 Pausing for manual inspection. Ctrl+C to terminate.")
            time.sleep(3600)
    
    logger.info("✅ Tests have finished")


# ──────────────────────────────
# Orion Adapter
# ──────────────────────────────

class OrionAdapter:
    """
    Adapter class responsible for interacting with the Orion Context Broker.

    It uses OrionRequestData configurations to:
    - Create subscriptions.
    - Send entity updates.
    """
    def __init__(self, orion_host: str, orion_port: str, generators: List[OrionRequestData]):
        """
        Initializes the OrionAdapter instance with the necessary connection data
        to interact with the Orion Context Broker.

        Parameters:
        - orion_host: Host address of the Orion broker.
        - orion_port: Port of the Orion broker.
        - generators: List of OrionRequestData objects for managing subscriptions and updates.
        """
        self.orionHost = orion_host
        self.orionPort = orion_port
        self.baseUrl = f"http://{orion_host}:{orion_port}/v2"
        self.generators = generators
        self.headers = {
            g.name: {
                "content-type": "application/json",
                "Fiware-Service": g.service,
                "Fiware-ServicePath": g.subservice,
                "Accept": "application/json"
            }
            for g in generators
        }

    def create_subscriptions(self):
        """
        Creates subscriptions in the Orion Context Broker as defined in each
        OrionRequestData object. Subscriptions are sent via HTTP.
        """
        for generator in self.generators:
            headers_ = self.headers[generator.name]
            for _, subscription in generator.subscriptions.items():
                response = requests.post(
                    f"{self.baseUrl}/subscriptions",
                    headers=headers_,
                    data=json.dumps(subscription)
                )
                assert response.status_code in [201, 204], f"Subscription failed: {response.content}"

    def update_entities(self):
        """
        Sends entity updates to the Orion Context Broker using the append operation
        with flow control enabled.
        """
        params = {"options": "flowControl"}
        for generator in self.generators:
            data = {
                "actionType": "append",
                "entities": generator.updateEntities
            }
            headers_ = self.headers[generator.name]
            response = requests.post(
                f"{self.baseUrl}/op/update",
                params=params,
                data=json.dumps(data),
                headers=headers_
            )
            logger.debug(f"[Orion update] {response.status_code} {response.content}")
            assert response.status_code in [201, 204]


# ──────────────────────────────
# Service Operations
# ──────────────────────────────

class ServiceOperations:
    """
    Coordinates service-level operations for end-to-end testing.

    Responsibilities include:
    - Managing subscriptions and entity updates in Orion.
    - Using the provided service containers and test scenario data.
    """
    def __init__(self, multi_service_container, generated_data):
        """
        Initializes the ServiceOperations class, responsible for coordinating actions with Orion.

        Parameters:
        - multi_service_container: Instance containing all running service containers.
        - generated_data: List of OrionRequestData objects containing the test scenario data.
        """
        self.multi_service_container = multi_service_container
        self.topics_raw = ["raw_historic", "raw_lastdata", "raw_mutable"]
        self.generators = generated_data

    def orion_set_up(self):
        """
        Sets up the Orion Context Broker for testing by:
        1. Creating the necessary subscriptions.
        2. Sending entity updates based on the test scenario data.
        """
        orion_adapter = OrionAdapter(
            self.multi_service_container.orionHost,
            self.multi_service_container.orionPort,
            self.generators
        )
        orion_adapter.create_subscriptions()
        orion_adapter.update_entities()
