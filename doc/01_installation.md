# 🧰 Installation Guide – Setting up Kafnus

This guide helps you get Kafnus up and running locally.

All required plugins, connectors, and monitoring tools are now automatically built and included via the **Kafnus Connect Dockerfile**.  
You don’t need to manually download or compile any JARs—everything is handled during the Docker build.

---

## 1. 📦 Kafnus Connect Plugins Setup

Kafnus Connect uses a **custom Docker image** that already includes:

- All required connectors (JDBC, MongoDB, MQTT)
- Custom SMTs like the `HeaderRouter`
- Dependencies (e.g., PostgreSQL and MongoDB drivers)
- JMX Prometheus Java Agent for monitoring

This image is automatically built the first time you run:

```
./docker-up.sh
```

> ⚠️ Note about Docker images  
> The `docker-compose.*.yml` files specify the `image:` option for Kafnus NGSI and Kafnus Connect.  
> If the image is not present locally, Docker Compose will try to pull it from the registry (Docker Hub by default) and will show a warning if the image is not found.  
> For now, this warning is expected and does not affect test execution, as images are built dynamically or local images are used depending on the environment.

You can still inspect or modify the plugin structure by looking inside:

```
kafnus-connect/plugins/
```

This directory is automatically populated during the image build, based on the logic in the [Dockerfile](/kafnus-connect/Dockerfile).

---

## 2. ⚙️ Kafnus NGSI Worker Image

The **Kafnus NGSI stream processor** is also containerized and automatically built during `docker-up.sh` execution. This ensures the worker is:

- Compiled with the correct Python version and dependencies
- Isolated from the host system
- Ready to run with the default command:  

```bash
faust -A stream_processor worker -l info
```

The source code lives in:

```
kafnus-ngsi/src/
```


The build process for Kafnus NGSI is defined in the [Dockerfile](/kafnus-ngsi/Dockerfile), which installs all dependencies and starts the worker.

> ℹ️ No additional setup is required—this container is fully managed within the `docker compose` environment.


---

## 3. 🐍 Python Environment Setup

> ✅ Requires **Python 3.11**

Recommended: use a virtual environment and install dependencies (from root):

```bash
cd tests_end2end/functional/
python3 -m venv pytests-venv
source pytests-venv/bin/activate
pip install -r requirements.txt
```

> Before running the tests, copy the example environment file:

```bash
cp .env.example .env
```

> Then, customize any necessary environment variables (e.g. KAFNUS_TESTS_USE_EXTERNAL_POSTGIS, KAFNUS_TESTS_E2E_MANUAL_INSPECTION, etc.) in `.env`.

---

## 4. 🐳 Launch Docker Environment

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
export DBPATH_POSTGIS=/data/postgis
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
kafnus-ngsi
orion
kafnus-connect
kafka
iot-postgis
mongo
mosquitto
```


---

## 5. 🔌 Check Kafnus Connect Plugins

```bash
curl -s http://localhost:8083/connector-plugins | jq
```

Look for:

- `com.telefonica.kafnus.mqtt.MqttSourceConnector`
- `io.confluent.connect.jdbc.JdbcSinkConnector`
- `com.mongodb.kafka.connect.MongoSinkConnector`

---

## 6. ⚙️ Register Kafka Connectors

Hint: Before registering the connectors, make sure the tests database has been created. This is explained in the next section.

```bash
cd sinks/

curl -X POST -H "Content-Type: application/json" --data @pg-sink-historic.json http://localhost:8083/connectors
curl -X POST -H "Content-Type: application/json" --data @pg-sink-lastdata.json http://localhost:8083/connectors
curl -X POST -H "Content-Type: application/json" --data @pg-sink-mutable.json http://localhost:8083/connectors
curl -X POST -H "Content-Type: application/json" --data @pg-sink-errors.json   http://localhost:8083/connectors
curl -X POST -H "Content-Type: application/json" --data @mqtt-source.json     http://localhost:8083/connectors
```

Hint: you can check that connectors have been correctly added listing them with:

```bash
curl -H "Accept: application/json" http://localhost:8083/connectors
```

However, note that the registration is not kept if docker containers are stopped.

---

## 7. 🧪 Quick Manual Test (MQTT → PostGIS)

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

### 7.1. Create Orion Subscription

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

### 7.2. Trigger a Notification

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

## 8. 🧹 Shut Down

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
- Kafnus Connect plugins verified
- Manual end-to-end flow from Orion to PostGIS working
- Python tooling installed for further testing

---

## 🧭 Navigation

- [⬅️ Previous: Overview](./00_overview.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Architecture](./02_architecture.md)
