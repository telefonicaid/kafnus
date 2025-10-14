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
from typing import List, Union
import pytest
import requests
#from testcontainers.compose import DockerCompose
from testcontainers.compose import DockerCompose as OriginalDockerCompose
import subprocess
import os
from utils.kafnus_connect_loader import deploy_all_sinks
import time

from config import logger
from typing import Optional
from utils.wait_services import wait_for_kafnus_connect, wait_for_connector, wait_for_postgres, wait_for_orion, ensure_postgis_db_ready, wait_for_kafnus_ngsi

# ──────────────────────────────
# Utils
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
    deleteEntities: Optional[list] = None


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
    This includes Orion, Kafka, Kafnus-Connect, Kafnus-NGSI, and optionally PostGIS.

    It also deploys the required Kafnus connectors and waits for them to become active.
    
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
        "docker-compose.ngsi.yml"
    ]

    if not use_external_pg:
        compose_files.append("docker-compose.postgis.yml")

    with DockerCompose(str(docker_dir), compose_file_name=compose_files) as compose:
        orion_host = compose.get_service_host("orion", 1026)
        orion_port = compose.get_service_port("orion", 1026)

        kafka_host = compose.get_service_host("kafka", 9092)
        kafka_port = compose.get_service_port("kafka", 9092)

        kafnus_connect_host = compose.get_service_host("kafnus-connect", 8083)
        kafnus_connect_port = compose.get_service_port("kafnus-connect", 8083)

        logger.info("✅ Services successfully deployed")

        sinks_dir = Path(__file__).resolve().parent.parent / "sinks"
        logger.debug(f"📂 sinks_dir path: {sinks_dir}")
        logger.debug(f"📁 Files found: {[f.name for f in sinks_dir.glob('*')]}")

        # Setup PostgreSQL DB with PostGIS extension
        KAFNUS_TESTS_PG_HOST = os.getenv("KAFNUS_TESTS_PG_HOST", "localhost")
        KAFNUS_TESTS_PG_PORT = int(os.getenv("KAFNUS_TESTS_PG_PORT", "5432"))
        KAFNUS_TESTS_PG_USER = os.getenv("KAFNUS_TESTS_PG_USER", "postgres")
        KAFNUS_TESTS_PG_PASSWORD = os.getenv("KAFNUS_TESTS_PG_PASSWORD", "postgres")

        wait_for_orion(orion_host, orion_port)
        wait_for_postgres(KAFNUS_TESTS_PG_HOST, KAFNUS_TESTS_PG_PORT)
        ensure_postgis_db_ready(KAFNUS_TESTS_PG_HOST, KAFNUS_TESTS_PG_PORT, KAFNUS_TESTS_PG_USER, KAFNUS_TESTS_PG_PASSWORD)
        
        wait_for_kafnus_connect()
        logger.info("🚀 Deployings sinks...")
        deploy_all_sinks(sinks_dir)
        wait_for_connector()
        wait_for_connector("jdbc-historical-sink")
        wait_for_connector("mongo-sink")

        wait_for_kafnus_ngsi(f"{kafka_host}:{kafka_port}")

        yield MultiServiceContainer(
            orionHost=orion_host,
            orionPort=orion_port,
            kafkaHost=kafka_host,
            kafkaPort=kafka_port,
            kafkaConnectHost=kafnus_connect_host,
            KafkaConnectPort=kafnus_connect_port
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
            if response.status_code == 413:
                logger.error("❌ Request too large, please check the input data size.")

            assert response.status_code in [201, 204]

    def delete_entities(self):
        """
        Deletes entities from the Orion Context Broker as defined in each
        OrionRequestData object.
        """
        for generator in self.generators:
            if not generator.deleteEntities:
                continue

            # Copy headers and delete Content-Type
            headers_ = {k: v for k, v in self.headers[generator.name].items() if k.lower() != "content-type"}

            for entity in generator.deleteEntities:
                entity_id = entity["id"]
                entity_type = entity.get("type")
                params = {"type": entity_type} if entity_type else {}

                response = requests.delete(
                    f"{self.baseUrl}/entities/{entity_id}",
                    headers=headers_,
                    params=params
                )

                if response.status_code == 404:
                    logger.warning(f"⚠️ Entity not found: {entity_id}")
                elif response.status_code != 204:
                    logger.error(f"❌ Error deleting {entity_id}: {response.status_code} {response.content}")
                    assert False, f"Failed to delete entity {entity_id}"
                else:
                    logger.debug(f"[Orion delete] {response.status_code} {response.content}")
                assert response.status_code in [204], f"Failed to delete entity {entity_id}: {response.content}"



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
        self.topics_raw = ["raw_historic", "raw_lastdata", "raw_mutable", "raw_mongo", "raw_sgtr"]
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
        orion_adapter.delete_entities()
