# 🔄 Kafnus Connect Configuration and Plugins

This document explains how Kafnus Connect is configured to persist NGSI notifications processed by Kafnus NGSI to different data sinks (PostGIS and MongoDB).

---


## ⚙️ Environment Setup

This project uses Docker Compose to orchestrate the multi-service environment, including Kafnus Connect and other components.

**Important:**  
In tests, we override the default `docker-compose` CLI used by some tools and libraries to instead use the latest Docker Compose V2 syntax (`docker compose`). This ensures compatibility with the newest Docker CLI features and avoids issues related to the deprecated `docker-compose` command.

The custom Python fixture leverages this by substituting commands so that all compose operations run through `docker compose` (V2), not `docker-compose` (V1).

> ⚠️ **Note:** Legacy `docker-compose` command could be used, you can simply remove or disable the custom overriding class (`DockerCompose`) in the test fixtures in [`common_test.py`](../tests_end2end/functional/common_test.py). Doing so will revert to the default behavior.

---

## 🧩 Kafnus Connect Plugins

Kafnus Connect plugins are automatically built into the Docker image.

You can inspect them at runtime under the `kafnus-connect/plugins/` directory.  
This directory is **populated automatically** during the Docker build using the logic defined in the [Dockerfile](/kafnus-connect/Dockerfile).

### 1. JDBC Plugin for PostGIS

Path: `kafnus-connect/plugins/kafka-connect-jdbc/`

Includes:

- `kafka-connect-jdbc-10.7.0.jar`
- `postgresql-42.7.1.jar`

Used in:
- `pg-sink-historic.json`
- `pg-sink-lastdata.json`
- `pg-sink-mutable.json`
- `pg-sink-errors.json`

### 2. MongoDB Sink Plugin

Path: `kafnus-connect/plugins/mongodb/`

Includes:

- `mongo-kafka-connect-1.10.0-confluent.jar`
- MongoDB drivers (`bson`, `driver-core`, `driver-sync`)

> 🚧 Mongo support is experimental and may change.

### 3. HTTP Sink Connector

**Path:** `sinks/http-sink.json`

This connector enables sending data from Kafka topics to an external HTTP endpoint. It is now part of the supported sinks in the Kafnus architecture.

- **Connector class**: `io.confluent.connect.http.HttpSinkConnector`
- **Type**: sink
- **Version**: 1.7.0
- **Example config file**: `http-sink.json`
- **Kafka topic**: `tests_http` (configurable)
- **HTTP endpoint**: e.g., `http://172.17.0.1:3333`

> ✅ The HTTP Sink Connector allows integration with external REST APIs and is useful for forwarding processed data to web services.

### 4. Custom SMT – HeaderRouter

Path: `kafnus-connect/plugins/header-router`

A Java-based Single Message Transform (SMT) implemented in `HeaderRouter.java`. It rewrites the topic name based on a Kafka record header (e.g. `target_table`) set by Kafnus NGSI.

#### SMT Configuration Example

```json
"transforms": "HeaderRouter",
"transforms.HeaderRouter.type": "com.telefonica.HeaderRouter",
"transforms.HeaderRouter.header.key": "target_table"
```

---

## 🗂️ Sink Configurations

The sink connectors are defined under the `sinks/` directory and are responsible for persisting data processed by Kafka (and Kafnus NGSI) to destination databases.

### Configuration files:

- `pg-sink-historic.json`:  
  - **Mode**: Insert-only  
  - Stores immutable historical data  
  - No upserts – every record is stored

- `pg-sink-lastdata.json`:  
  - **Mode**: Upsert  
  - Stores only the latest observation (per entity and attribute)  
  - Based on timestamp or unique identifiers

- `pg-sink-mutable.json`:  
  - **Mode**: Mutable upsert  
  - Designed for data that may change (e.g., device status)

- `pg-sink-errors.json`:  
  - **Mode**: DLQ (Dead Letter Queue)  
  - Captures failed records during transformation or persistence  
  - Useful for debugging and monitoring errors

- `mdb-sink.json`:  
  - **Type**: MongoDB sink  
  - Persists data from Kafka topics to MongoDB collections  
  - Supports custom database and collection mapping via message fields  
  - Example topic: `test_mongo`

- `http-sink.json`:  
  - **Type**: HTTP sink  
  - Forwards data from Kafka topics to an external HTTP endpoint  
  - Useful for integration with REST APIs or webhooks  
  - Example topic: `tests_http`

Each file could include:
- Kafka topic configuration (`topics`)
- Destination table mapping (PostGIS)
- JDBC dialect (PostgreSQL)
- SMT transformations (e.g., `HeaderRouter`)
- Error handling logic
- HTTP endpoint configuration (for http-sink)

> ✅ Historic, lastdata and mutable connectors use the JDBC plugin and the custom `HeaderRouter` SMT to dynamically route data to specific tables.

---

## ▶️ Registering Connectors

From the `sinks/` directory, you can register each connector using `curl`:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  --data @pg-sink-historic.json
```

> ℹ️ Ensure the `tests` database exists before registering the connectors.  

Repeat the same process for the other configuration files:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  --data @pg-sink-lastdata.json

curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  --data @pg-sink-mutable.json

curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  --data @pg-sink-errors.json

curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  --data @mdb-sink.json

curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  --data @http-sink.json
```

> To confirm that the connectors were successfully registered, run:

```bash
curl -H "Accept: application/json" http://localhost:8083/connectors
```

> To check connector status:

```bash
curl -s http://localhost:8083/connectors/your-connector/status | jq
```

**Expected output (example):**

```json
[
  "pg-sink-historic",
  "pg-sink-lastdata",
  "pg-sink-mutable",
  "pg-sink-errors",
  "mongo-sink",
  "http-sink"
]
```

> 🔍 If a connector is missing, check the Kafnus Connect logs (`docker logs kafnus-connect`) to identify possible errors in loading or configuration.

---

## 🧪 Testing Sinks

You can verify data arrival using:

```bash
docker exec -it kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic YOUR_TOPIC_NAME \
  --from-beginning --max-messages 10
```

To confirm persistence, check tables in PostGIS or MongoDB after running the corresponding test input.

## 🧭 Navigation

- [⬅️ Previous: Kafnus NGSI](/doc/05_kafnus_ngsi.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Monitoring](/doc/07_monitoring.md)