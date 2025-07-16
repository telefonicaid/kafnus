# 📘 Kafnus – Project Overview

Kafnus is a Kafka-based stream processing and persistence service designed to replace Cygnus in FIWARE-based smart city environments.

## 🎯 Purpose

Kafnus offers a scalable, resilient, and modular system to process NGSI notifications from the Context Broker and persist them into target databases using modern stream processing technologies.

---

## 🧩 Key Components

### 🛰️ Input Layer
- **Mosquitto + MQTT Kafka Connector**  
  Temporarily receives notifications from the Context Broker.

### 🧠 Processing Layer
- **Kafnus NGSI Stream Processor**  
  A Python-based service that enriches and transforms raw notifications into structured messages. Each flow (e.g., `historic`, `lastdata`, `mutable`) is managed by a dedicated Kafnus NGSI agent.

### 💾 Persistence Layer
- **Kafnus Connect (JDBC + MongoDB)**  
  - Custom SMT and patched JDBC connector to handle PostGIS geometries.
  - MongoDB connector for storing JSON documents.

---

## 🔄 Data Flow

1. **CB → MQTT (Mosquitto)**  
2. **MQTT → Kafka (custom MQTT connector)**  
3. **Kafka raw topics → Kafnus NGSI agents**  
4. **Kafnus NGSI → Kafka processed topics**  
5. **Kafka → Kafnus Connect → PostGIS / MongoDB**

![Simplified Temporal Schema with Mosquitto](/doc/SimplifiedTemporalSchema.png)

---

## 📊 Observability

- **Prometheus** scrapes metrics from Kafnus NGSI and Kafnus Connect.
- **Grafana** dashboards visualize processing throughput, lag, task states, etc.
- **Kafka Exporter** and **JMX Exporter** enhance Kafka and JVM observability.

---

## 🧪 Testing Strategy

- Functional end-to-end tests using Python + Pytest + Testcontainers.
- Each scenario defines:
  - Input notifications
  - Optional DB setup
  - Expected persisted output

---

## 🛣️ Future Plans

- Remove Mosquitto once CB supports Kafka output natively.
- Advance Mongo's functionality.
- Implement HTTP agent.
- Update tests if the testcontainer library adds direct support for Docker Compose V2

---

## 📂 Source Structure (simplified)

- `kafnus-ngsi/`: Kafnus NGSI logic and tests  
- `docker/`: docker-compose files and scripts  
- `monitoring/`: Prometheus + Grafana setup  
- `tests_end2end/`: E2E test cases and framework  
- `sinks/`: Example connectors used for tests  
- `kafnus-connect/`: Builds image with needed plugins  
  - `src/mqtt-kafka-connect/`: Source code for temporal mqtt connector  
  - `src/header-router/`: Custom Single Message Transform (SMT) implementation  
  - `src/own-jdbc-connector/`: Contains patch needed for building own JDBC custom connector  

## Navegación

- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Installation](/doc/01_installation.md)