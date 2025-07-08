# kafnus mqtt-kafka-connect

## Components

The following technologies are used through Docker containers:
* mosquitto
* Kafka, the streaming platform
* Kafka Connect
* [Java 11+(recommended 21)](https://openjdk.java.net)
* [Apache Maven](https://maven.apache.org)
* Orion* (for integrations with Orion mqtt subscriptions - Notifications received in kafka)
* mongo* (for integrations with Orion mqtt subscriptions - Notifications received in kafka)

The containers are pulled directly from official Docker Hub images.
The Connect image used here needs some additional packages, some of them from `libs` directory, so it must be built from the 
included Dockerfile.

## ⚙️ Building components

### Build the Kafka Connect image

```
docker build -t connector -f connector.Dockerfile .
```

### Build the custom mqtt-kafka-connect

```
mvn clean package
```

Supporting mqtt dependencies for kafka connect

```
mvn dependency:copy-dependencies -DoutputDirectory=libs -DincludeTransitive=true -Dartifact=com.hivemq:hivemq-mqtt-client:1.3.5
```

💡 A file named `target/mqtt-kafka-connect-1.0.jar` will be created . This is your mqtt source connector for Kafka Connect


## ⬆️ Bring up the environment

```
docker-compose up -d --build
```

### Add a custom connector to mqtt source

```
curl -X POST -H "Accept:application/json" -H "Content-Type: application/json" \
      --data @mqtt-source.json http://localhost:8083/connectors
```

## ⏹ Undeploy the connector

Use the following commands to undeploy the connector from Kafka Connect:

```
curl -X DELETE http://localhost:8083/connectors/mosquitto-source-connector
```

The connector subscribes exclusively to MQTT topics under the format `kafnus/+/+/+`. 
Each message is forwarded to a Kafka topic named after the last segment of the MQTT topic (example: for `kafnus/x/y/z`, the destination will be topic z in Kafka).

## Test general operation of the connector

To publish a message directly through the Mosquitto container in the topic `kafnus/service/servicePath/raw`, execute this command:

```
docker exec -it mosquitto mosquitto_pub -t "kafnus/service/servicePath/raw" -m "Hello from container" -h localhost
```

To inspect the messages published to the `raw` topic, you can execute the following Kafka console consumer command inside the Kafka Docker container:

```
docker exec -it kafka \
  kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic raw \
  --from-beginning \
  --property print.headers=true \
  --property print.value=true \
  --property key.separator=" | " \
  --property headers.separator=" | " \
  --property headers.deserializer=org.apache.kafka.common.serialization.StringDeserializer
```

When consuming messages from the raw topic, the console will display each message in the following structured format:

```
fiware-service:service | fiware-servicepath:servicePath | Hello from container
```

## Integration mqtt source connector with Orion

To create a subscription in Orion Context Broker that publishes notifications to an MQTT topic `kafnus/tests/sensors/raw_historic` with FIWARE headers `fiware-service: tests`, `fiware-servicepath: /sensors`, use the following curl command:

```
curl -X POST http://localhost:1026/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "fiware-service: tests" \
  -H "fiware-servicepath: /sensors" \
  -d '{
    "description": "Suscripción MQTT para datos de Room",
    "subject": {
      "entities": [{"idPattern": ".*", "type": "Room"}],
      "condition": {
        "attrs": ["temperature", "humidity"]
      }
    },
    "notification": {
      "mqtt": {
        "url": "mqtt://mosquitto:1883",
        "topic": "kafnus/tests/sensors/raw"
      },
      "attrs": ["temperature", "humidity"]
    }
  }'
```
To create a new entity in Orion with FIWARE headers `fiware-service: tests`, `fiware-servicepath: /sensors`, use the following HTTP request, you can also update existing entities:

```
curl -X POST http://localhost:1026/v2/entities \
  -H "Content-Type: application/json" \
  -H "fiware-service: tests" \
  -H "fiware-servicepath: /sensors" \
  -d '{
    "id": "Room",
    "type": "Room",
    "temperature": {
      "value": 23,
      "type": "Number",
      "metadata": {}
    },
    "pressure": {
      "value": 720,
      "type": "Number",
      "metadata": {}
    }
  }'
```

in the console where the kafka-console-consumer was executed, the following should be printed
```
fiware-service:tests | fiware-servicepath:sensors | {"subscriptionId":"684f33eb436758adec043c1b","data":[{"id":"Room","type":"Room","temperature":{"type":"Number","value":23,"metadata":{}}}]}

```
