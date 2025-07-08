# 🛰️ Kafnus

**Kafnus** is a smart city data persistence system, designed as a modern replacement for Cygnus, built on top of **Kafka**.

It processes NGSI notifications from the Context Broker (CB) and stores them in **PostGIS** and **MongoDB**, leveraging technologies like **Faust**, **Kafka Connect**, and custom connectors.

---

## 📦 Main Components

- 🧭 **Mosquitto + MQTT Kafka Connector**  
  Temporary entry point for CB notifications (to be removed once CB supports native Kafka output).

- ⚙️ **Faust Stream Processor**  
  Transforms raw notifications into structured events. Each data flow (historic, lastdata, mutable, etc.) is handled by an independent agent.

- 🔄 **Kafka Connect**  
  Persists processed messages to:
  - **PostGIS**, via a modified JDBC connector and custom SMT.
  - **MongoDB**, via the official MongoDB connector.

- 📊 **Monitoring**  
  Integrated with Prometheus and Grafana to expose metrics from Kafka, Connect, and Faust.

- 🧪 **End-to-End Testing**  
  Functional tests implemented in Python using Pytest and Testcontainers.

---

## 🚀 Purpose

- Replace Cygnus in FIWARE smart city stacks.
- Provide robust, extensible ingestion with real-time stream processing.
- Offer a Kafka-based architecture ready for future scalability.

---

## 📁 Documentation

Complete documentation is available in the [`doc/`](./doc) directory:

- [`00_overview.md`](./doc/00_overview.md) – Project overview
- [`01_installation.md`](./doc/01_installation.md) – How to install & build
- [`02_architecture.md`](./doc/02_architecture.md) – System architecture
- [`03_operational_guide.md`](./doc/03_operational_guide.md) – Operational guide
- [`04_docker.md`](./doc/04_docker.md) – Docker details
- [`05_faust.md`](./doc/05_faust.md) – Faust stream processor
- [`06_kafka_connect.md`](./doc/06_kafka_connect.md) – Kafka Connect sinks
- [`07_monitoring.md`](./doc/07_monitoring.md) – Metrics & observability
- [`08_testing.md`](./doc/08_testing.md) – Test structure

---

## 🛠️ Requirements

- Docker + docker compose
- Java 11+
- Python 3.11+ (for tests)
- Maven
