# 🔄 Kafnus Connect Overview

Kafnus Connect is the component responsible for persisting the NGSI notifications processed by **Kafnus NGSI** into external data sinks such as **PostGIS**, **MongoDB**, or **HTTP endpoints**.  
It is built upon **Kafka Connect**, and forms part of the modular Kafnus architecture designed to replace **Cygnus** with a more scalable, flexible, and cloud-native ecosystem.

---

## ⚙️ Role in the Kafnus Ecosystem

Within the Kafnus architecture:

1. **Kafnus NGSI** receives notifications from the **Orion Context Broker** and publishes normalized NGSI records into Kafka topics.  
2. **Kafnus Connect** consumes those topics and routes the data to persistent sinks (databases or external APIs) using configurable sink connectors.
3. Each sink connector can apply **transformations** (e.g. routing by headers or topics) before writing to its destination.

This modular design allows flexible data routing and storage without modifying the upstream services.

---

## 🧩 Supported Sink Types

Kafnus Connect currently supports the following sinks:

- **PostGIS (JDBC Sink)** – stores structured entity data into PostgreSQL/PostGIS tables  
- **MongoDB Sink** – persists JSON-based documents  
- **HTTP Sink** – forwards data to REST APIs or external endpoints  

Custom **Single Message Transforms (SMTs)**, such as the `HeaderRouter`, are also available to dynamically route records based on message metadata.

---

## 🧱 Deployment and Configuration

Kafnus Connect runs as a standalone **Kafka Connect distributed worker**.  
Its configuration is generated dynamically via the `docker-entrypoint.sh` script based on environment variables defined in the Docker Compose setup.

Connectors are registered automatically or via REST API calls (`POST /connectors`), with their definitions stored as JSON files in the `sinks/` directory.

For example:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  --data @pg-sink-historic.json
```

The environment and plugin structure are fully described in the [kafnus-connect repository](https://github.com/telefonicaid/kafnus-connect)

## 🧪 Testing and Integration

In the Kafnus-NGSI repository, tests include the **Kafnus Connect** service within the multi-service Docker Compose environment.
This enables end-to-end verification — from NGSI ingestion to final data persistence in PostGIS or MongoDB.

Example topics for testing:
- `tests_pg_historic`
- `tests_pg_lastdata`
- `tests_mongo`
- `tests_http`

The configuration ensures reproducible and isolated testing environments for all connectors.

---

## 🧭 Navigation

- [⬅️ Previous: Kafnus NGSI](/doc/05_kafnus_ngsi.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Monitoring](/doc/07_monitoring.md)
