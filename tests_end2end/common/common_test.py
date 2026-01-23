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


import json
from pathlib import Path
from dataclasses import dataclass
from typing import List, Union, Optional
import pytest
import requests
#from testcontainers.compose import DockerCompose
from testcontainers.compose import DockerCompose as OriginalDockerCompose
import subprocess
import os
import time

from common.config import logger
from common.utils.kafnus_connect_loader import deploy_all_sinks
from common.utils.wait_services import wait_for_kafnus_connect, wait_for_connector, wait_for_postgres, wait_for_orion, ensure_postgis_db_ready, wait_for_kafnus_ngsi
from common.utils.utils import find_subscription_id_by_description

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
    ngsiAdminHost: str
    ngsiAdminPort: str
    compose: object # DockerCompose object


@dataclass
class OrionRequestData:
    name: str
    service: str
    subservice: str
    subscriptions: dict
    updateEntities: list
    deleteEntities: Optional[list] = None
    updateSubscription: Optional[list] = None

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
    
    import subprocess

    def _service_exists(self, service_name: str) -> bool:
        """
        Check if a service exists in the current docker-compose stack.
        Uses `docker compose config --services` for introspection.
        """
        cmd = self._build_compose_command("config")
        cmd.append("--services")

        # Replace docker-compose with docker compose if needed
        if cmd and cmd[0] == "docker-compose":
            cmd = ["docker", "compose"] + cmd[1:]

        try:
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
            )
        except subprocess.CalledProcessError as e:
            logger.warning(
                f"⚠️ Could not list compose services, assuming '{service_name}' does not exist. "
                f"stderr={e.stderr}"
            )
            return False

        services = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        return service_name in services

    def _start_service(self, service_name: str) -> None:
        cmd = self._build_compose_command("start")
        cmd.append(service_name)
        self._call_command(cmd)


    def _stop_service(self, service_name: str) -> None:
        cmd = self._build_compose_command("stop")
        cmd.append(service_name)
        self._call_command(cmd)

    def safe_stop(self, service_name: str) -> None:
        if self._service_exists(service_name):
            logger.info(f"⛔ Stopping service '{service_name}'")
            self._stop_service(service_name)
        else:
            logger.debug(f"⚠️ Service '{service_name}' not present in this compose stack, skipping stop")


    def safe_start(self, service_name: str) -> None:
        if self._service_exists(service_name):
            logger.info(f"▶ Starting service '{service_name}'")
            self._start_service(service_name)
        else:
            logger.debug(f"⚠️ Service '{service_name}' not present in this compose stack, skipping start")

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

        kafnus_ngsi_host = compose.get_service_host("kafnus-ngsi", 8000)
        kafnus_ngsi_port = compose.get_service_port("kafnus-ngsi", 8000)

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

        KAFNUS_NGSI_PREFIX_TOPIC = os.getenv("KAFNUS_NGSI_PREFIX_TOPIC", "smc_")
        KAFNUS_NGSI_SUFFIX_TOPIC = os.getenv("KAFNUS_NGSI_SUFFIX_TOPIC", "_processed")
        wait_for_kafnus_ngsi(f"{kafka_host}:{kafka_port}", prefix_topic=KAFNUS_NGSI_PREFIX_TOPIC, suffix_topic=KAFNUS_NGSI_SUFFIX_TOPIC)

        yield MultiServiceContainer(
            orionHost=orion_host,
            orionPort=orion_port,
            kafkaHost=kafka_host,
            kafkaPort=kafka_port,
            kafkaConnectHost=kafnus_connect_host,
            KafkaConnectPort=kafnus_connect_port,
            ngsiAdminHost=kafnus_ngsi_host,
            ngsiAdminPort=kafnus_ngsi_port,
            compose=compose
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
        self.subscription_ids = {}

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
                
                # Store subscription ID for future reference
                location = response.headers.get("Location")
                if location:
                    sub_id = location.split("/")[-1]
                    self.subscription_ids[subscription["description"]] = sub_id

    def update_subscription(self, name, changes):
        """
        Updates an existing subscription. If the subscription ID is not known
        (e.g., test case is executed in a fresh process), we recover it from Orion.
        """
        sub_id = self.subscription_ids.get(name)

        # If not in memory, try to discover it from Orion
        if not sub_id:
            # Pick *any* generator’s headers (same service/servicePath as test case)
            generator = self.generators[0]
            headers_ = self.headers[generator.name]

            sub_id = find_subscription_id_by_description(self.baseUrl, name, headers_)
            if not sub_id:
                raise AssertionError(f"Subscription '{name}' not found in Orion")
            
            # Save it in memory
            self.subscription_ids[name] = sub_id
        else:
            # If we DO have the ID, we still need the right headers
            generator = self.generators[0]
            headers_ = self.headers[generator.name]

        # Perform PATCH
        response = requests.patch(
            f"{self.baseUrl}/subscriptions/{sub_id}",
            headers=headers_,
            data=json.dumps(changes)
        )

        assert response.status_code in [200, 204], (
            f"Update failed for {name}: {response.status_code} {response.content}"
        )

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
        KAFNUS_NGSI_PREFIX_TOPIC = os.getenv("KAFNUS_NGSI_PREFIX_TOPIC", "smc_")
        KAFNUS_NGSI_SUFFIX_TOPIC = os.getenv("KAFNUS_NGSI_SUFFIX_TOPIC", "_processed")
        self.topics_raw = [f"{KAFNUS_NGSI_PREFIX_TOPIC}raw_historic", f"{KAFNUS_NGSI_PREFIX_TOPIC}raw_lastdata", f"{KAFNUS_NGSI_PREFIX_TOPIC}raw_mutable", f"{KAFNUS_NGSI_PREFIX_TOPIC}raw_mongo", f"{KAFNUS_NGSI_PREFIX_TOPIC}raw_sgtr"]
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
        for generator in self.generators:
            if getattr(generator, "updateSubscription", None):
                for update in generator.updateSubscription:
                    desc = update["description"]
                    changes = update["changes"]
                    orion_adapter.update_subscription(desc, changes)
        orion_adapter.update_entities()
        orion_adapter.delete_entities()
