# 🏗️ Architecture Overview

This document describes the high-level architecture of Kafnus, a Kafka-based stream processing and persistence platform for smart city NGSI notifications.

---

## 🗺️ Conceptual Flow

The system is designed to replace Cygnus in FIWARE-based environments, introducing a modern, Kafka-native architecture. The key stages are:

1. **Ingestion**
2. **Stream Processing**
3. **Persistence**
4. **Monitoring**

The system supports multiple data flows (`historic`, `lastdata`, `mutable`) and **PostGIS**, **MongoDB** and **HTTP** sinks.

---

### 🗄️ PostGIS (JDBC) Flow

1. **CB → Kafka**  
   NGSIv2 notifications are published directly from the Context Broker to Kafka raw topics (`<PREFIX>raw_historic`, `<PREFIX>raw_lastdata`, `<PREFIX>raw_mutable`).

2. **Kafka → Kafnus NGSI**  
   The NGSI processor consumes these raw topics. Each flow is handled by a dedicated agent. Processing includes:
   - Enrichment (`recvtime`)
   - Conversion of `geo:*` fields to WKB
   - Emitting NGSI-standard headers (fiware-service, fiware-servicepath, entityType, etc.)
   - No SQL-specific logic (schema/table decisions deferred to Kafka Connect)

3. **Kafnus NGSI → Kafka**  
   Processed events are emitted to tenant-specific Kafka topics (`<PREFIX><service><FLOW><SUFFIX>`, example: `smc_<service>_lastdata_processed`) with NGSI headers and metadata.

4. **Kafka → Kafnus Connect (HeaderRouter SMT)**  
   The **HeaderRouter** SMT intercepts each message:
   - Reads NGSI headers (fiware-service, fiware-servicepath, entityType, etc.)
   - Applies the configured **SQL datamodel** (e.g., `dm-by-entity-type-database`)
   - Constructs the final `schema.table` name
   - Overwrites the Kafka topic with this value
   
   Supported datamodels:
   - `dm-by-entity-type-database`: `<service>.<servicepath>_<entityType>`
   - `dm-by-fixed-entity-type-database-schema`: `<servicepath>.<entityType>`
   - `dm-postgis-errors`: `<service>.<service>_error_log` (for error DLQ)
   - `dm-http-errors`: `<service>.<service>_error_log` (evolving)

5. **Kafka → Kafnus Connect (JDBC Sink) → PostGIS**  
   The JDBC Sink persists the message into the table specified by the rewritten topic, using standard `table.name.format: ${topic}` configuration. No additional routing is needed.

**Key advantage:** This design separates concerns:
- NGSI is **schema-agnostic** (only emits NGSI metadata)
- Kafka Connect handles **all SQL routing decisions**
- New datamodels can be added without modifying NGSI code

---

### 🍃 MongoDB Flow (simpler)

- Input arrives via `raw_mongo` Kafka topic.  
- The **Mongo agent** parses the event, extracts `fiware-service` and `fiware-servicepath` from headers, and builds the **target DB/collection**.
- The namespace prefix is **configurable** via `KAFNUS_NGSI_MONGO_PREFIX` (default: `sth_`), allowing different MongoDB naming conventions per deployment.
- Example database/collection naming: `<MONGO_PREFIX><service>.<MONGO_PREFIX><servicepath>` 
- Documents are enriched with `recvTime`.  
- A producer publishes the final document to the `test_mongo` topic, from where the **MongoDB sink connector** persists into the right collection.

👉 Unlike JDBC, Mongo does **not** use the `HeaderRouter` SMT. Routing is embedded in the agent logic
(`namespace.mapper` handles DB/collection mapping). See [MongoDB Namespace Prefix Configuration](/doc/05_kafnus_ngsi.md#mongodb-namespace-prefix-configuration) for details.

---

### 🌐 HTTP Flow (simpler)

- Input arrives via `raw_sgtr` Kafka topic.  
- The **HTTP agent** parses the message, extracts Fiware context, and builds a **GraphQL mutation** (or another HTTP-compatible payload) for the entity.  
- The mutation is published to the `test_http` Kafka topic.  
- The **HTTP sink connector** (Aiven implementation) forwards the payload to the configured external API.

👉 Again, no `HeaderRouter` is involved. The logic is limited to transforming the NGSI entity into the desired HTTP
payload before forwarding.


---

✅ **Summary:**  
- **PostGIS**: Two-tier routing (NGSI → Kafka topic, HeaderRouter SMT → SQL schema.table), with configurable datamodels and schema override support.  
- **MongoDB**: Direct mapping in NGSI agent (headers → DB/collection names), prefix-configurable.  
- **HTTP**: Direct mapping in NGSI agent (entity → mutation → HTTP endpoint).  

---

## 🖼️ Architecture Diagrams

### Simplified View

This image shows the core data path for a single postgis flow:

![Simplified Architecture](../doc/images/SimplifiedSchema.png)

> 📝 **Edit source**: You can view and modify the diagram using [Excalidraw](https://excalidraw.com/#room=e06782c4fdd1d900246a,f_sdKK90w0FsFWKnDWsYmw).


### Full View (PostGIS)

Detailed diagram showing all services and flows in the PostGIS variant:
![Full Architecture](../doc/images/FullSchema.png)

> 📝 **Edit source**: You can view and modify the diagram using [Excalidraw](https://excalidraw.com/#room=e06782c4fdd1d900246a,f_sdKK90w0FsFWKnDWsYmw).


---

## 🧩 Component Overview

### 🚪 Ingestion

- **Context Broker (CB)**: Directly notifies Kafka with NGSIv2 events.
- **Input topics**: 
   - `<PREFIX>raw_historic`
   - `<PREFIX>raw_lastdata`
   - `<PREFIX>raw_mutable`
   - `<PREFIX>raw_errors`
   - `<PREFIX>raw_mongo`
   - `<PREFIX>raw_sgtr`

### 🧠 Processing – Kafnus NGSI

- Written in Node.js (previously Python/Faust, now deprecated)
- Processes raw NGSIv2 notifications
- Applies logic per flow
- Produces to dynamic topics

### 🛢️ Persistence – Kafnus Connect

- **JDBC Connector** (with PostGIS geometry support)
- **MongoDB Connector**
- **HTTP Connector**
- **Custom SMT (`HeaderRouter`)** rewrites topic name from header (used for postgis flows)

Kafnus Connect configurations are defined in JSON files under `sinks/`.

---

## 🏗️ Extensibility

- Easy to add new flows by defining new Kafnus NGSI agents.
- Flexible topic-to-table mapping via Kafka headers and SMT.
- Kafnus Connect sink configuration is modular (JSON files).
- PostGIS, MongoDB and HTTP pipelines can evolve independently.

---

## 🧭 Navigation

- [⬅️ Previous: Installation](/doc/01_installation.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Operational-Guide](/doc/03_operational_guide.md)