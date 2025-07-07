# 🔄 Kafka Connect Configuration and Plugins

This document explains how Kafka Connect is configured to persist NGSI notifications processed by Faust to different data sinks (PostGIS and MongoDB).

---

## 🧩 Kafka Connect Plugins

Located under the `plugins/` directory:

### 1. JDBC Plugin for PostGIS

Path: `plugins/kafka-connect-jdbc-10.7.0/`

Includes:

- `kafka-connect-jdbc-10.7.0.jar`
- `postgresql-42.7.1.jar`

Used in:
- `pg-sink-historic.json`
- `pg-sink-lastdata.json`
- `pg-sink-mutable.json`
- `pg-sink-erros.json`

### 2. MongoDB Sink Plugin

Path: `plugins/mongodb/`

Includes:

- `kafka-connect-mongodb-1.10.0.jar`
- MongoDB drivers (`bson`, `driver-core`, `driver-sync`)

> 🚧 Mongo support is experimental and may change.

### 3. Custom SMT – HeaderRouter

Path: `plugins/header-router-1.0.0.jar`

A Java-based Single Message Transform (SMT) implemented in `HeaderRouter.java`. It rewrites the topic name based on a Kafka record header (e.g. `target_table`) set by Faust.

#### SMT Configuration Example

```json
"transforms": "HeaderRouter",
"transforms.HeaderRouter.type": "com.example.HeaderRouter",
"transforms.HeaderRouter.header.key": "target_table"
```

### 4. MQTT Source Plugin

(A rellenar, comentar que es temporal...)

---

## 🗂️ Sink Configurations

(Detallar más y actualizar)

Defined in the `sinks/` folder:

- `pg-sink-historic.json`: Insert-only mode
- `pg-sink-lastdata.json`: Upsert mode based on timestamp
- `pg-sink-mutable.json`: Mutable data upsert
- `pg-sink-erros.json`: Sink for Connect DLQ error handling

Each file contains:
- Topic subscription
- Table mapping
- JDBC dialect (PostgreSQL)
- SMT transformations
- Dead-letter queue (if needed)

---

## ▶️ Registering Connectors

You can register connectors using `curl` from inside the `sinks/` directory:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  --data @pg-sink-historic.json
```

Repeat for `pg-sink-lastdata.json`, `pg-sink-mutable.json`, and `pg-sink-erros.json`.

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

## Navegación

- [⬅️ Previous: Faust](/doc/05_faust.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Monitoring](/doc/07_monitoring.md)