# 🏗️ Architecture Overview

This document describes the high-level architecture of Kafnus, a Kafka-based stream processing and persistence platform for smart city NGSI notifications.

---

## 🗺️ Conceptual Flow

The system is designed to replace Cygnus in FIWARE-based environments, introducing a modern, Kafka-native architecture. The key stages are:

1. **Ingestion**
2. **Stream Processing**
3. **Persistence**
4. **Monitoring**

The system supports multiple data flows (`historic`, `lastdata`, `mutable`) and both **PostGIS** and **MongoDB** sinks.

---

## 🔄 End-to-End Flow Description

1. **CB → Kafka**  
   NGSIv2 notifications are published to Kafka raw topics. Currently, this is done via a **custom MQTT Kafka connector**, but will eventually be replaced by direct CB-to-Kafka output.

2. **Kafka → Faust**  
   A Faust processor consumes messages from `raw_historic`, `raw_lastdata`, and `raw_mutable`. Each flow is handled by a dedicated agent. Processing includes:
   - Enrichment (`recvtime`)
   - Conversion of `geo:*` fields to WKB
   - Schema construction
   - Header setting for routing

3. **Faust → Kafka**  
   Processed events are emitted to new Kafka topics (`<service>`, `<service>_lastdata`, etc.) along with a header (`target_table`) indicating the intended DB table.

4. **Kafka → Kafka Connect → DB**  
   Kafka Connect sink connectors (JDBC or MongoDB) persist messages into the appropriate database tables. A custom SMT (`HeaderRouter`) rewrites the topic name from the Kafka header.

---

## 🖼️ Architecture Diagrams

### Simplified View

This image shows the core data path for a single flow:

![Simplified Architecture](../doc/SimplifiedSchema.png)

> 📝 **Edit source**: You can view and modify the diagram using [Excalidraw](https://excalidraw.com/#room=e06782c4fdd1d900246a,f_sdKK90w0FsFWKnDWsYmw).


### Full View (PostGIS)

Detailed diagram showing all services and flows in the PostGIS variant:

![Full Architecture](../doc/FullSchema.png)

> 📝 **Edit source**: You can view and modify the diagram using [Excalidraw](https://excalidraw.com/#room=e06782c4fdd1d900246a,f_sdKK90w0FsFWKnDWsYmw).


---

## 🧩 Component Overview

### 🚪 Ingestion

- **Mosquitto** (temporary)
- **mqtt-kafka-connect**: bridges MQTT to Kafka.
- **Input topics**: 
  - `kafnus/{service}{servicePath}/raw_historic`
  - `.../raw_lastdata`
  - `.../raw_mutable`

### 🧠 Processing – Faust

- Written in Python using [Faust](https://faust.readthedocs.io/)
- Processes raw NGSIv2 notifications
- Applies logic per flow:
  - `historic`: all events
  - `lastdata`: deduplicated by `TimeInstant`
  - `mutable`: allows field overwrite
- Sets Kafka headers like `target_table`
- Produces to dynamic topics (`{service}[_{flow}]`)

### 🛢️ Persistence – Kafka Connect

- **JDBC Connector** (with PostGIS geometry support)
- **MongoDB Connector**
- **Custom SMT (`HeaderRouter`)** rewrites topic name from header

Kafka Connect configurations are defined in JSON files under `sinks/`.

---

## 🏗️ Extensibility

- Easy to add new flows by defining new Faust agents.
- Flexible topic-to-table mapping via Kafka headers and SMT.
- Kafka Connect sink configuration is modular (JSON files).
- MongoDB pipeline can evolve independently.

---

## Navegación

- [⬅️ Previous: Installation](/doc/01_installation.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Operational-Guide](/doc/03_operational_guide.md)