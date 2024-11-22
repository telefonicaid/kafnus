from testcontainers.compose import DockerCompose
import pytest
import json
from kafka import KafkaConsumer
import requests
import time
from requests.exceptions import RequestException

@pytest.fixture(scope="module")
def orion_stack():
    with DockerCompose("../", compose_file_name=["docker-compose.yml"], pull=False, wait=True, build=True,) as compose:
        # Espera a que Orion esté listo
        host_orion = compose.get_service_host("orion")
        port_orion = compose.get_service_port("orion", 1026)
        wait_for_orion(host_orion, port_orion)

        host_kafka = compose.get_service_host("kafka")
        port_kafka = compose.get_service_port("kafka", 9092)
        wait_for_kafka(host_kafka, port_orion)

        host_connect = compose.get_service_host("connect", 8083)  # <- Cambio clave aquí
        port_connect = compose.get_service_port("connect", 8083)
        wait_for_connect(host_connect, port_connect)


        # Configurar el consumidor de Kafka
        consumer = KafkaConsumer(
            bootstrap_servers=f"{host_kafka}:{port_kafka}",
            auto_offset_reset="earliest",
            group_id="test-group",
            enable_auto_commit=False,
            consumer_timeout_ms=10000)

        yield {
            "compose": compose,
            "consumer": consumer,
            "orion_host": host_orion,
            "orion_port": port_orion,
            "host_connect": host_connect,
            "port_connect": port_connect

        }

        # Limpieza
        consumer.close()

def wait_for_orion(host, port, timeout=30):
    import time
    start_time = time.time()

    while time.time() - start_time < timeout:
        try:
            response = requests.get(f"http://{host}:{port}/version")
            if response.status_code == 200:
                return
        except:
            time.sleep(1)

    raise Exception("Orion no se inició en el tiempo esperado")

def wait_for_kafka(bootstrap_servers, timeout=60):
    """Espera a que Kafka esté listo."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            consumer = KafkaConsumer(
                bootstrap_servers=bootstrap_servers,
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

def wait_for_connect(host: str = "connect", port: int = 8083):
    timeout: int = 120
    interval: int = 5
    health_path: str = "/connectors"
    expected_status: int = 200
    """
    """

    headers_connector = {
        "content-type": "application/json",
        "Accept": "application/json"
    }
    mqtt_connector = {
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
    start_time = time.time()
    url = f"http://{host}:{port}{health_path}"

    print(f"Esperando a Kafka Connect en {url}...")

    while time.time() - start_time < timeout:
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == expected_status:
                print("✓ Kafka Connect está listo y respondiendo")
                response_connect = requests.post(f"{url}", data=json.dumps(mqtt_connector),
                                                 headers=headers_connector)
                assert response_connect.status_code in [201, 204]
                return True

            print(f"! Respuesta inesperada: {response.status_code}")

        except RequestException as e:
            print(f"x Error de conexión: {str(e)}")

        time.sleep(interval)

    raise TimeoutError(
        f"Kafka Connect no estuvo listo después de {timeout} segundos. "
        f"Última URL probada: {url}"
    )

def test_orion_operations(orion_stack):
    host_orion = orion_stack["orion_host"]  # Acceder a los valores guardados
    port_orion = orion_stack["orion_port"]
    host_connect = orion_stack["host_connect"]
    port_connect = orion_stack["port_connect"]
    consumer = orion_stack["consumer"]
    base_url = f"http://{host_orion}:{port_orion}/v2"


    headers = {
        "content-type": "application/json",
        "Fiware-Service": "alcobendas",
        "Fiware-ServicePath": "/agrosensors",
        "Accept": "application/json"
    }

    # Test creación de entidad
    entity = {
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
    }


    response = requests.post(f"{base_url}/entities", data=json.dumps(entity), headers=headers)
    print(response.content)
    assert response.status_code in [201, 204]

    time.sleep(1)

    headers_get_entity = {
        "Fiware-Service": "alcobendas",
        "Fiware-ServicePath": "/agrosensors",
        "Accept": "application/json"
    }

    # Test consulta de entidad
    response = requests.get(f"{base_url}/entities/hola", headers=headers_get_entity)
    assert response.status_code in [200, 201, 204]
    response_data = response.json()
    assert response_data["id"] == "hola"

    subscription = {
            "description": "A subscription to get info about Room1 with filtering expresion",
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
        }


    response = requests.post(f"{base_url}/subscriptions", data=json.dumps(subscription), headers=headers)
    assert response.status_code in [201, 204]


    update_entity = {
            "value": 27,
            "type": "Number"
        }


    response = requests.put(f"{base_url}/entities/hola/attrs/temperature", headers=headers, json=update_entity)
    assert response.status_code in [201, 204]

    topic_name = "raw_historic"

    # 3. Suscribirse al tópico
    consumer.subscribe([topic_name])
    consumer.poll(timeout_ms=1000)  # Poll inicial para asignar particiones

    # 4. Ir al inicio del tópico para asegurarnos de leer todos los mensajes
    consumer.seek_to_beginning(*consumer.assignment())

    # 5. Leer mensajes
    messages = []
    start_time = time.time()
    while len(messages) == 0 and (time.time() - start_time) < 10:  # Esperar hasta 10 segundos
        records = consumer.poll(timeout_ms=100000, max_records=1)
        if records:
            for tp, msgs in records.items():
                for message in msgs:
                    # Procesar headers
                    headers_str = ""
                    if message.headers:
                        headers_str = " | ".join([f"{k}:{v.decode('utf-8') if isinstance(v, bytes) else v}" for k, v in message.headers])

                    # Decodificar el valor del mensaje si es bytes
                    try:
                        message_value = message.value.decode('utf-8') if isinstance(message.value, bytes) else str(
                            message.value)
                        message_with_header = f"{headers_str} | {message_value}" if headers_str else message_value
                        messages.append(message_with_header)
                    except Exception as e:
                        print(f"Error processing message: {e}")
                        continue

        assert len(messages) > 0, "No se recibieron mensajes en el tópico Kafka"
        print(f"Mensajes recibidos: {messages}")

    # 6. Verificar mensajes
    # if not messages:
    #     # Debug adicional
    #     print(f"Particiones asignadas: {consumer.assignment()}")
    #     print(f"Posiciones actuales: {[consumer.position(tp) for tp in consumer.assignment()]}")
    #     print(f"Últos offsets: {[consumer.end_offsets([tp]) for tp in consumer.assignment()]}")

    assert len(messages) > 0, f"No se recibieron mensajes en el tópico {topic_name}"
