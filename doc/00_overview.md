# 📘 Kafnus – Project Overview

Kafnus is a Kafka-based stream processing and persistence service designed to replace Cygnus in FIWARE-based smart city environments. It consists of two components that cooperate with each other to fulfill this function in a modular and decoupled manner: kafnus-ngsi and kafnus-connect.

## 🎯 Purpose

Kafnus offers a scalable, resilient, and modular system to process NGSI notifications from the Context Broker and persist them into target databases using modern stream processing technologies.

---

## 🧩 Key Components

### 🛰️ Input Layer
- **Context Broker (CB) → Kafka**  
  The Context Broker directly notifies Kafka topics with NGSI notifications.

### 🧠 Processing Layer
- **Kafnus NGSI Stream Processor**  
  A Node.js-based service that enriches and transforms raw notifications into structured messages. Each flow (e.g., `historic`, `lastdata`, `mutable`, `mongo`...) is managed by a dedicated Kafnus NGSI agent.

### 💾 Persistence Layer
- **Kafnus Connect (JDBC + MongoDB + HTTP)** 
  The persistence layer it is implemented in a separate repository: [telefonicaid/kafnus-connect](https://github.com/telefonicaid/kafnus-connect). It includes:
  - Custom SMT and patched JDBC connector to handle PostGIS geometries.
  - MongoDB connector for storing JSON documents.
  - Enables notification to external HTTP endpoints for integration with third-party services.

---

## 🔄 Data Flow

1. **CB → Kafka**  
2. **Kafka raw topics → Kafnus NGSI agents**  
3. **Kafnus NGSI → Kafka processed topics**  
4. **Kafka → Kafnus Connect → PostGIS / MongoDB / HTTP**

![Simplified Schema](/doc/images/SimplifiedSchema.png)

---

## 📊 Observability

- **Prometheus** scrapes metrics from Kafnus NGSI and Kafnus Connect.
- **Grafana** dashboards visualize processing throughput, lag, task states, etc.
- **Kafka Exporter** and **JMX Exporter** enhance Kafka and JVM observability.

---

## 🧪 Testing Strategy

- Functional end-to-end tests using Python + Pytest + Testcontainers.
- Example sinks used for testing are included in [`tests_end2end/sinks/`](../tests_end2end).  
- Each scenario defines:
  - Optional description
  - Input notifications
  - Optional DB setup
  - Expected persisted output

---

## 🛣️ Future Plans

- Update tests if the testcontainer library adds direct support for Docker Compose V2

---

## 📂 Source Structure (simplified)

- `kafnus-ngsi/`: Kafnus NGSI logic and tests  
- `docker/`: docker-compose files and scripts  
- `monitoring/`: Prometheus + Grafana setup  
- `tests_end2end/`: E2E test cases and framework  
  - `sinks/`: Example connectors used for tests

---

## 📚 References

- [Kafnus repository and documentation](https://github.com/telefonicaid/kafnus)
- [Kafnus Connect repository](https://github.com/telefonicaid/kafnus-connect)
- [Orion documentation on Kafka notifications](https://github.com/telefonicaid/fiware-orion/blob/bdd41c4eac7326d0c2740816f53def0dfffeab9f/doc/manuals/user/kafka_notifications.md)
- [Apache Kafka documentation](https://kafka.apache.org/)
- [TelefonicaID fork of Confluent JDBC connector (PostGIS support)](https://github.com/telefonicaid/kafka-connect-jdbc-postgis)
- [MongoDB Kafka Connector documentation](https://www.mongodb.com/docs/kafka-connector/current/?msockid=317503fb1486698a24a21584151968d9)
- [Aiven HTTP Connector for Apache Kafka repository](https://github.com/Aiven-Open/http-connector-for-apache-kafka)

---

## 🧭 Navigation

- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Installation](/doc/01_installation.md)