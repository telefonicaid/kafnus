# 🛰️ Kafnus

**Kafnus** is a smart city data persistence system, designed as a modern replacement for Cygnus, built on top of **Kafka**.

It processes NGSI notifications from the Context Broker (CB) and stores them in **PostGIS** and **MongoDB**, leveraging technologies like **Faust**, **Kafka Connect**, and custom connectors.

---

## 📦 Main Components

- 🏢 **Context Broker (CB)**  
  The origin of NGSI notifications. It sends entity updates and context data to Kafka, where Kafnus NGSI listens and processes the incoming information.

- ⚙️ **Kafnus NGSI**  
  Node.js service that transforms raw notifications into structured events. Each data flow (historic, lastdata, mongo, etc.) is handled by an independent agent.

- 🔄 **Kafnus Connect**  
  Persistence component (Kafka Connect–based) responsible for storing processed NGSI messages. Custom image of Kafka Connect with plugins integrated.
  It is hosted in a separate repository: [telefonicaid/kafnus-connect](https://github.com/telefonicaid/kafnus-connect).  
  Supports:
  - **PostGIS**, via a modified JDBC connector and custom SMT.
  - **MongoDB**, via the official MongoDB connector.
  - **HTTP endpoints**, via a  Aiven-Open http connector for apache kafka.

- 📊 **Monitoring**  
  Integrated with Prometheus and Grafana to expose metrics from Kafka, Kafnus Connect, and Kafnus NGSI.

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
- [`05_kafnus_ngsi.md`](./doc/05_kafnus_ngsi.md) – Kafnus NGSI stream processor
- [`06_kafnus_connect.md`](./doc/06_kafnus_connect.md) – Kafnus Connect and sinks details
- [`07_monitoring.md`](./doc/07_monitoring.md) – Metrics & observability
- [`08_testing.md`](./doc/08_testing.md) – Test structure
- [`09_scaling.md`](./doc/09_scaling.md) – Scaling Kafka and Kafnus NGSI

---

## 🛠️ Requirements

- Docker + docker compose
- Java 11+
- Node.js 20+ (for Kafnus NGSI)
- Python 3.11+ (for tests)
- Maven

> 🧭 **Project structure note**
>
> This repository is part of the [Kafnus ecosystem](https://github.com/telefonicaid/kafnus).
> - [Kafnus NGSI (processing)](https://github.com/telefonicaid/kafnus)
> - [Kafnus Connect (persistence)](https://github.com/telefonicaid/kafnus-connect)