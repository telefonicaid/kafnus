# 🧰 Installation Guide – Setting up Kafnus

This document provides step-by-step instructions to prepare and launch the Kafnus system. It covers the required plugins, custom builds, Python environment, and Docker setup.

---

## 1. 📦 Kafka Connect Plugins Setup

Kafka Connect requires several custom and third-party `.jar` files under:

```bash
./plugins/
```

### ✅ Required JARs

```plaintext
plugins/
├── header-router-1.0.0.jar
├── kafka-connect-jdbc-10.7.0/
│   ├── kafka-connect-jdbc-10.7.0.jar
│   └── postgresql-42.7.1.jar
├── mongodb/
│   ├── kafka-connect-mongodb-1.10.0.jar
│   ├── mongodb-driver-core-4.9.1.jar
│   ├── mongodb-driver-sync-4.9.1.jar
│   └── bson-4.9.1.jar
└── mqtt-kafka-connect/
    └── mqtt-kafka-connect-1.0-jar-with-dependencies.jar
```

Next section explains how to build all them. At the end of executing the procedure described in that section, your
`plugins/` directory should look like shown above.

---

## 2. 🔨 Building Required JARs

> ✅ Requires **Java 17+**, **Maven 3.6+**

You can check your version with:

```bash
mvn --version
java --version
```

---

### 2.1. HeaderRouter (Custom SMT)

From the root of the project:

```bash
cd kafka-ngsi-stream/header-router/
mvn clean package
mkdir -p ../../plugins
cp target/header-router-1.0.0-jar-with-dependencies.jar ../../plugins/header-router-1.0.0.jar
```

---

### 2.2. MQTT Source Connector

Modified version with dependencies included:

```bash
cd ../../mqtt-kafka-connect/
mvn clean package
mkdir -p ../plugins/mqtt-kafka-connect/
cp target/mqtt-kafka-connect-1.0-jar-with-dependencies.jar ../plugins/mqtt-kafka-connect/
```

---

### 2.3. Custom JDBC Connector with PostGIS Support

Do this inside `own-jdbc-connector/`, where the patch file is located. Based on [PR #1048](https://github.com/confluentinc/kafka-connect-jdbc/pull/1048):

```bash
cd ../own-jdbc-connector/
git clone https://github.com/confluentinc/kafka-connect-jdbc.git
cd kafka-connect-jdbc
git checkout v10.7.0
git apply ../postgis-support.patch
mvn clean package -DskipTests -Dcheckstyle.skip=true
mkdir -p ../../plugins/kafka-connect-jdbc-10.7.0
cp target/kafka-connect-jdbc-10.7.0.jar ../../plugins/kafka-connect-jdbc-10.7.0/
```

Download PostgreSQL driver (required)

```bash
wget https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.1/postgresql-42.7.1.jar -P ../../plugins/kafka-connect-jdbc-10.7.0/
```

---

### 🔗 Download MongoDB Kafka Sink Connector and Dependencies

To use MongoDB with Kafka Connect, you need the MongoDB connector and its dependencies.

You can obtain the **MongoDB Kafka Connector** (`mongo-kafka-connect-1.10.0-confluent.jar`) from:

👉 **[Confluent Hub – MongoDB Kafka Connector](https://www.confluent.io/hub/mongodb/kafka-connect-mongodb)**

> 📌 This project uses **version `1.10.0`**, but newer version (e.g., `1.16.0`) has been tested and `1.10+` versions are expected to work without issues.  
> ✅ Alternatively, you can install it using the Confluent Hub CLI:

After downloading the `.zip` manually, extract it and copy the `.jar` from the `lib/` folder:

```bash
unzip kafka-connect-mongodb-1.10.0.zip
mkdir -p plugins/mongodb/
cp kafka-connect-mongodb-1.10.0/lib/mongo-kafka-connect-1.10.0-confluent.jar plugins/mongodb/
```

Then download the required MongoDB driver JARs from Maven Central:

- [`mongodb-driver-core-4.9.1.jar`](https://repo1.maven.org/maven2/org/mongodb/mongodb-driver-core/4.9.1/mongodb-driver-core-4.9.1.jar)
- [`mongodb-driver-sync-4.9.1.jar`](https://repo1.maven.org/maven2/org/mongodb/mongodb-driver-sync/4.9.1/mongodb-driver-sync-4.9.1.jar)
- [`bson-4.9.1.jar`](https://repo1.maven.org/maven2/org/mongodb/bson/4.9.1/bson-4.9.1.jar)

```bash
cd plugins/mongodb/
wget https://repo1.maven.org/maven2/org/mongodb/mongodb-driver-core/4.9.1/mongodb-driver-core-4.9.1.jar
wget https://repo1.maven.org/maven2/org/mongodb/mongodb-driver-sync/4.9.1/mongodb-driver-sync-4.9.1.jar
wget https://repo1.maven.org/maven2/org/mongodb/bson/4.9.1/bson-4.9.1.jar
```

---

## 3. 📥 Download External Tools (Optional – for Monitoring)

If you plan to use **Prometheus and Grafana** for monitoring Kafka Connect, you’ll need to download the **JMX Prometheus Java Agent**.

Kafka Connect exposes JMX metrics, and this Java agent allows Prometheus to scrape them via HTTP.

> 🧠 This is only needed if you plan to activate `docker-compose.monitoring.yml`

### 🔧 JMX Prometheus Agent

Download it to the `monitoring/` directory:

```bash
# Ensure no conflicting directory exists
rm -rf monitoring/jmx_prometheus_javaagent.jar

wget https://repo1.maven.org/maven2/io/prometheus/jmx/jmx_prometheus_javaagent/0.20.0/jmx_prometheus_javaagent-0.20.0.jar -O monitoring/jmx_prometheus_javaagent.jar
```

This file will be automatically mounted into the Kafka Connect container if monitoring is enabled.

The default port is `9100`, and the configuration file used is `monitoring/kafka-connect.yml`.

---

## 4. 🐍 Python Environment Setup

> ✅ Requires **Python 3.11**

Recommended: use a virtual environment and install dependencies:

```bash
cd tests_end2end/functional/
python3 -m venv pytests-venv
source pytests-venv/bin/activate
pip install -r requirements.txt
```

---

## 5. 🐳 Launch Docker Environment

### 🌐 Kafka Network: `kafka-postgis-net`

All containers are connected to a common **external Docker network** named:

```yaml
networks:
  kafka-postgis-net:
    external: true
```

This is declared in all `docker-compose` files.

---

#### ✅ If you do NOT have this network yet:

Hint: you can check if using `docker network ls`.

You must create it manually before running `docker compose`:

```bash
docker network create kafka-postgis-net
```

---

### 🔌 Connecting to PostGIS

You have two options:

---

✅ **1. If you already have an external PostGIS instance running**

You must connect your PostGIS container to the shared Docker network:

```bash
docker network connect kafka-postgis-net your-postgis-container-name
```

> Replace `your-postgis-container-name` with the actual container name.

You must also define the `DBPATH_POSTGIS` environment variable, pointing to the host directory where your external PostGIS instance stores data:

```bash
export DBPATH_POSTGIS=/data/postgis
```

> ⚠️ **IMPORTANT**: Ensure this directory exists and is owned by UID 999 and GID 999 (commonly used by PostGIS). Otherwise, the container may fail to start:

```bash
sudo chown -R 999:999 ${DBPATH_POSTGIS}
```


✅ **2. If you want to use the internal PostGIS container**

Uncomment the relevant line in `docker-up.sh` to include the internal PostGIS container.

Also define the same environment variable:

```bash
export DBPATH_POSTGIS=/data/pg
```

Ensure that the directory exists and is writable by the container (UID/GID 999):

```bash
sudo chown -R 999:999 ${DBPATH_POSTGIS}
```

---

### 🏁 Startup

Now launch the environment:

```bash
cd docker/
./docker-up.sh
```

Check containers are running:

```bash
docker ps
```

You should see at least:

```plaintext
faust-stream
orion
kafka-connect
kafka
iot-postgis
mongo
mosquitto
```


---

## 6. 🔌 Check Kafka Connect Plugins

```bash
curl -s http://localhost:8083/connector-plugins | jq
```

Look for:

- `com.telefonica.kafnus.mqtt.MqttSourceConnector`
- `io.confluent.connect.jdbc.JdbcSinkConnector`
- `com.mongodb.kafka.connect.MongoSinkConnector`

---

## 7. ⚙️ Register Kafka Connectors

Hint: Before registering the connectors, make sure the tests database has been created. This is explained in the next section.

```bash
cd sinks/

curl -X POST -H "Content-Type: application/json" --data @pg-sink-historic.json http://localhost:8083/connectors
curl -X POST -H "Content-Type: application/json" --data @pg-sink-lastdata.json http://localhost:8083/connectors
curl -X POST -H "Content-Type: application/json" --data @pg-sink-mutable.json http://localhost:8083/connectors
curl -X POST -H "Content-Type: application/json" --data @pg-sink-erros.json   http://localhost:8083/connectors
curl -X POST -H "Content-Type: application/json" --data @mqtt-source.json     http://localhost:8083/connectors
```

Hint: you can check that connectors have been correctly added listing them with:

```bash
curl -H "Accept: application/json" http://localhost:8083/connectors
```

However, note that the registration is not kept if docker containers are stopped.

---

## 8. 🧪 Quick Manual Test (MQTT → PostGIS)

You must have:

- A database: `tests`
- A schema: `test`
- A table: `test.simple_sensor`

Hint: you can get a PG command interface in the container using `docker exec -it <container name> psql -U postgres` in the host

```sql
-- Assuming database 'tests' already exist, typically CREATE DATABASE tests;
\c tests
CREATE SCHEMA IF NOT EXISTS test;
CREATE TABLE test.simple_sensor (
  recvtime TIMESTAMPTZ,
  fiwareservicepath TEXT,
  entityid TEXT,
  entitytype TEXT,
  timeinstant TIMESTAMPTZ,
  temperature DOUBLE PRECISION
);
```

---

### 8.1. Create Orion Subscription

```bash
curl -X POST http://localhost:1026/v2/subscriptions \
  -H "Content-Type: application/json" \
  -H "fiware-service: test" \
  -H "fiware-servicepath: /simple" \
  -d '{
    "description": "Suscripción MQTT para datos de prueba",
    "subject": {
        "entities": [{ "idPattern": ".*", "type": "Sensor" }],
        "condition": { "attrs": [ "TimeInstant" ] }
    },
    "notification": {
        "mqttCustom": {
            "url": "mqtt://mosquitto:1883",
            "topic": "kafnus/test/simple/raw_historic"
        },
        "attrs": ["TimeInstant", "temperature"]
    }
  }'
```

Hint: you can check the subscription has been correctly created executing `curl -H 'fiware-service: test' -H 'fiware-servicepath: /simple' http://localhost:1026/v2/subscriptions`

---

### 8.2. Trigger a Notification

```bash
curl -X POST http://localhost:1026/v2/entities?options=upsert,forcedUpdate \
  -H "Content-Type: application/json" \
  -H "fiware-service: test" \
  -H "fiware-servicepath: /simple" \
  -d '{
    "id": "Sensor1",
    "type": "Sensor",
    "TimeInstant": {
      "type": "DateTime",
      "value": "2025-07-01T11:00:00Z"
    },
    "temperature": {"value": 26.0, "type": "Float"}
  }'
```

Hint: you can repeat the above command several times to send additional notifications.

You should now see data in the `test.simple_sensor` table in PostGIS, like this:

```
tests=# SELECT * FROM test.simple_sensor;

          recvtime          | fiwareservicepath | entityid | entitytype |      timeinstant       | temperature 
----------------------------+-------------------+----------+------------+------------------------+-------------
 2025-07-03 12:23:53.926+00 | simple            | Sensor1  | Sensor     | 2025-07-01 11:00:00+00 |          26
 2025-07-03 13:54:22.45+00  | simple            | Sensor1  | Sensor     | 2025-07-01 11:00:00+00 |          26
(2 rows)
```

> 💡 For a full test, refer to the [08_testing.md](./08_testing.md) guide.

---

## 9. 🧹 Shut Down

To stop all services:

```bash
cd docker/
./docker-down.sh
```

---

## ✅ Summary

At this point, you should have:

- All required `.jar` plugins correctly built and placed
- Docker services up and running
- Kafka Connect plugins verified
- Manual end-to-end flow from Orion to PostGIS working
- Python tooling installed for further testing

---

## 🧭 Navigation

- [⬅️ Previous: Overview](./00_overview.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Architecture](./02_architecture.md)
