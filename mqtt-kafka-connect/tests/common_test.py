from time import sleep
from testcontainers.compose import DockerCompose
import pytest
import json
from kafka import KafkaConsumer
import requests
import time
from requests.exceptions import RequestException
from dataclasses import dataclass
from typing import List

headers_mqtt_to_kafka_connector = {
        "content-type": "application/json",
        "Accept": "application/json"
    }

mqtt_to_kafka_connector = {
        "name": "mosquitto-source-connector",
        "config": {
            "connector.class": "com.example.mqtt.MqttSourceConnector",
            "mqtt.broker": "mosquitto",
            "mqtt.topic": "kafnus/+/+/+",
            "kafka.topic": "mqtt_events",
            "mqtt.username": "user",
            "mqtt.password": "pass",
            "tasks.max": "1",
            "mqtt.qos": "1"
        }
    }

@dataclass
class MultiServiceContainer:
    """Centralizes management of multiservice Docker environments during end-to-end testing."""
    orionHost: str
    orionPort: str
    kafkaHost: str
    kafkaPort: str
    consumer: KafkaConsumer
    mqttToKafkaConnectHost: str
    mqttToKafkaConnectPort: str

@pytest.fixture(scope="module")
def multiservice_stack():
    with DockerCompose("../", compose_file_name=["docker-compose.yml"], pull=False, wait=True, build=True) as compose:
        #orion service
        orion_host = compose.get_service_host("orion")
        orion_post = compose.get_service_port("orion", 1026)
        wait_for_orion(orion_host, orion_post)

        #kafka service
        kafka_host = compose.get_service_host("kafka", 9092)
        kafka_port = compose.get_service_port("kafka", 9092)
        wait_for_kafka(kafka_host, kafka_port)

        #mqtt to kafka connect
        mqtt_to_kafka_connect_host = compose.get_service_host("connect", 8083)
        mqtt_to_kafka_connect_port = compose.get_service_port("connect", 8083)
        wait_for_mqtt_to_kafka_connect(mqtt_to_kafka_connect_host, mqtt_to_kafka_connect_port)

        # Configuring Kafka consumer
        consumer = KafkaConsumer(
            bootstrap_servers=f"{kafka_host}:{kafka_port}",
            auto_offset_reset="earliest",
            group_id="test-group",
            enable_auto_commit=False,
            consumer_timeout_ms=10000)

        yield MultiServiceContainer(
            orionHost=orion_host,
            orionPort=orion_post,
            kafkaHost=kafka_host,
            kafkaPort=kafka_port,
            consumer=consumer,
            mqttToKafkaConnectHost=mqtt_to_kafka_connect_host,
            mqttToKafkaConnectPort=mqtt_to_kafka_connect_port
        )
        # Cleaning
        consumer.close()

def wait_for_orion(host, port, timeout=30):
    """Wait until orion is ready."""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"http://{host}:{port}/version")
            if response.status_code == 200:
                return
        except:
            time.sleep(1)
    raise Exception("Orion did not start in the expected time")

def wait_for_kafka(host_kafka, port_kafka, timeout=60):
    """Wait until Kafka is ready."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            consumer = KafkaConsumer(
                bootstrap_servers=f"{host_kafka}:{port_kafka}",
                auto_offset_reset="earliest",
                group_id="test-wait-group",
                consumer_timeout_ms=1000
            )
            consumer.topics()
            consumer.close()
            return
        except Exception:
            pass
        time.sleep(1)
    raise TimeoutError("Kafka no estuvo listo a tiempo")

def wait_for_mqtt_to_kafka_connect(host: str = "connect", port: int = 8083):
    """Wait until mqtt to kafka Connect is ready."""
    timeout: int = 120
    interval: int = 5
    health_path: str = "/connectors"
    expected_status: int = 200
    start_time = time.time()
    url = f"http://{host}:{port}{health_path}"

    print(f"Esperando a Kafka Connect en {url}...")

    while time.time() - start_time < timeout:
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == expected_status:
                print("✓ Kafka Connect is ready and responding")
                response_connect = requests.post(f"{url}", data=json.dumps(mqtt_to_kafka_connector), headers=headers_mqtt_to_kafka_connector)
                assert response_connect.status_code in [201, 204]
                return True
            print(f"! Unexpected response: {response.status_code}")

        except RequestException as e:
            print(f"x Connection error: {str(e)}")
        time.sleep(interval)

    sleep(1000)
    raise TimeoutError(
        f"Kafka Connect was not ready after {timeout} seconds."
        f"Last URL tested: {url}"
    )

@dataclass
class OrionRequestData:
    """Orion request data"""
    service: str
    subservice: str
    entities: list
    subscriptions: list
    updateEntities: list

class OrionRequestGenerator:
    service: str
    subservice: str
    entities: list
    subscriptions: list
    updateEntities: list

    """Orion request generator"""

    def generate(self):
        service = "alcobendas"
        subservice = "/test"
        entities = [
            {
                "id": "hola",
                "type": "Room",
                "temperature": {
                    "value": 23,
                    "type": "Number"
                },
                "pressure": {
                    "value": 720,
                    "type": "Number"
                }
            },
            {
                "id": "hola1",
                "type": "Room",
                "temperature": {
                    "value": 23,
                    "type": "Number"
                },
                "pressure": {
                    "value": 720,
                    "type": "Number"
                }
            },
            {
                "id": "hola",
                "type": "Room1",
                "temperature": {
                    "value": 23,
                    "type": "Number"
                },
                "pressure": {
                    "value": 720,
                    "type": "Number"
                }
            }
        ]
        subscriptions = [
            {
                "description": "A subscription to get info about Room1 with filtering expresi",
                "subject": {
                    "entities": [
                        {
                            "idPattern": ".*",
                            "type": "Room"
                        }
                    ],
                    "condition": {
                        "attrs": [
                            "temperature"
                        ]
                    },
                    "expression": {
                        "q": "pressure:700..800"
                    }
                },
                "notification": {
                    "mqttCustom": {
                        "url": "mqtt://mosquitto:1883",
                        "topic": "kafnus/${service}${servicePath}/raw_historic"
                    },
                    "attrs": [
                        "*",
                        "servicePath"
                    ]
                },
                "expires": "2040-01-01T14:00:00.00Z"
            },
            {
                "description": "A subscription to get info about Room1 with filtering",
                "subject": {
                    "entities": [
                        {
                            "idPattern": ".*",
                            "type": "Room1"
                        }
                    ],
                    "condition": {
                        "attrs": [
                            "temperature"
                        ]
                    },
                    "expression": {
                        "q": "pressure:700..800"
                    }
                },
                "notification": {
                    "mqttCustom": {
                        "url": "mqtt://mosquitto:1883",
                        "topic": "kafnus/${service}${servicePath}/raw_historic"
                    },
                    "attrs": [
                        "*",
                        "servicePath"
                    ]
                },
                "expires": "2040-01-01T14:00:00.00Z"}

        ]
        update_entities = [
            {
                "id": "hola",
                "type": "Room",
                "temperature": {
                    "value": 27,
                    "type": "Number"
                }
            },
            {
                "id": "hola1",
                "type": "Room",
                "temperature": {
                    "value": 50,
                    "type": "Number"
                }
            },
            {
                "id": "hola",
                "type": "Room1",
                "temperature": {
                    "value": 27,
                    "type": "Number"
                }
            },
            {
                "id": "hola",
                "type": "Room1",
                "temperature": {
                    "value": 5,
                    "type": "Number"
                }
            }
        ]
        generador = OrionRequestData(
            service=service,
            subservice=subservice,
            entities=entities,
            subscriptions=subscriptions,
            updateEntities=update_entities
            )
        return generador

class OrionAdapter:
    """Orion adapter"""
    orionHost:str
    orionPort:str
    baseUrl: str
    headers: dict
    generator: OrionRequestData

    def __init__(self, orionHost:str, orionPort:str, generator:OrionRequestData):
        self.orionHost = orionHost
        self.orionPort = orionPort
        self.baseUrl = f"http://{orionHost}:{orionPort}/v2"
        self.generator = generator
        self.headers = {
        "content-type": "application/json",
        "Fiware-Service": self.generator.service,
        "Fiware-ServicePath": self.generator.subservice,
        "Accept": "application/json"
        }
    def create_subscriptions(self):
        """create subscriptions"""
        headers = {
        "content-type": "application/json",
        "Fiware-Service": self.generator.service,
        "Fiware-ServicePath": self.generator.subservice,
        "Accept": "application/json"
        }
        for s in self.generator.subscriptions:
            response = requests.post(f"{self.baseUrl}/subscriptions", data=json.dumps(s), headers=headers)
            assert response.status_code in [201, 204]

    def create_entities(self):
        """Create entities"""
        for entity in self.generator.entities:
            response = requests.post(f"{self.baseUrl}/entities", data=json.dumps(entity), headers=self.headers)
            print(response.content)
            assert response.status_code in [201, 204]

    def get_entities(self):
        """get entities"""
        headers_get_entity = {
            "Fiware-Service": self.generator.service,
            "Fiware-ServicePath": self.generator.subservice,
            "Accept": "application/json"
        }

        #consult each entity
        entity_names = List(map(lambda entity: entity["id"],self.generator.entities))
        for entity in entity_names:
            response = requests.get(f"{self.baseUrl}/entities/{entity}", headers=headers_get_entity)
            assert response.status_code in [200, 201, 204]
            response_data = response.json()
            assert response_data["id"] == "hola"

    def update_entities(self):
        """update entities"""
        update_entity = {
            "value": 27,
            "type": "Number"
        }

        for entity in self.generator.updateEntities:
            enity_id = entity["id"]
            entity_type = entity["type"]
            enity_copy = entity.copy()
            enity_copy.pop("id")
            enity_copy.pop("type")
            params = {
                "type": entity_type
            }
            response = requests.patch(f"{self.baseUrl}/entities/{enity_id}/attrs", headers=self.headers, params=params, json=enity_copy)
            assert response.status_code in [201, 204]

class ServiceOperations:
    """Service operations"""


    def __init__(self):
        pass
