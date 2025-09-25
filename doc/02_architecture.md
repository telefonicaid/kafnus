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
   NGSIv2 notifications are published directly from the Context Broker to Kafka raw topics (`raw_historic`, `raw_lastdata`, `raw_mutable`).

2. **Kafka → Kafnus NGSI**  
   The NGSI processor consumes these raw topics. Each flow is handled by a dedicated agent. Processing includes:
   - Enrichment (`recvtime`)
   - Conversion of `geo:*` fields to WKB
   - Schema construction
   - Header setting for routing

3. **Kafnus NGSI → Kafka**  
   Processed events are emitted to tenant-specific Kafka topics (`<service>`, `<service>_lastdata`, etc.) along with a header (`target_table`) indicating the intended DB table.

4. **Kafka → Kafnus Connect → PostGIS**  
   Sink connectors (`JdbcSinkConnector`) persist messages into relational tables.  
   The `HeaderRouter` SMT rewrites the topic name from the Kafka header, ensuring the event lands in the correct table
   (`historic`, `lastdata`, `mutable`, `errors`).

---

### 🍃 MongoDB Flow (simpler)

- Input arrives via `raw_mongo` Kafka topic.  
- The **Mongo agent** parses the event, extracts `fiware-service` and `fiware-servicepath` from headers, and builds the **target DB/collection** (e.g. `sth_<service>.<servicepath>`).  
- Documents are enriched with `recvTime`.  
- A producer publishes the final document to the `test_mongo` topic, from where the **MongoDB sink connector** persists into the right collection.

👉 Unlike JDBC, Mongo does **not** use the `HeaderRouter` SMT. Routing is embedded in the agent logic
(`namespace.mapper` handles DB/collection mapping).

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
- **PostGIS**: Complex path (schema building, topic→table mapping, HeaderRouter).  
- **MongoDB**: Direct mapping (headers → DB/collection).  
- **HTTP**: Direct mapping (entity → mutation → HTTP endpoint).  

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
   - `raw_historic`
   - `raw_lastdata`
   - `raw_mutable`
   - `raw_errors`
   - `raw_mongo`
   - `raw_sgtr`

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