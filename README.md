![FIWARE Incubating](https://fiware.github.io/catalogue/badges/statuses/status-incubating.svg)

# 🛰️ Kafnus

[![CI](https://github.com/telefonicaid/kafnus/actions/workflows/kafnus_ngsi_coverage.yml/badge.svg?branch=main)](https://github.com/telefonicaid/kafnus/actions/workflows/kafnus_ngsi_coverage.yml)
[![Coverage Status](https://coveralls.io/repos/github/telefonicaid/kafnus/badge.svg?branch=main)](https://coveralls.io/github/telefonicaid/kafnus?branch=main)
[![Docker badge](https://img.shields.io/badge/docker-telefonicaiot%2Fkafnus-blue?logo=docker)](https://hub.docker.com/r/telefonicaiot/kafnus)

**Kafnus** is a smart city data persistence system, designed as a modern replacement for Cygnus, built on top of **Kafka**.

It processes NGSI notifications from the Context Broker (CB) and stores them in **PostGIS** and **MongoDB**, leveraging technologies like **Kafka Stream**, **Kafka Connect**, and custom connectors.

This project is part of [FIWARE](https://www.fiware.org/). For more information
check the FIWARE Catalogue entry for the
[Core Context Management](https://github.com/Fiware/catalogue/tree/master/core).

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
- [`03_advanced_topics.md`](./doc/03_advanced_topics.md) – Advanced topics with Operational guide
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

## 👥 Contributors

The list of contributors to the Kafnus project can be found in
[`CONTRIBUTORS.md`](./CONTRIBUTORS.md).

## License

Kafnus is licensed under [Affero General Public License (GPL)
version 3](./LICENSE).

© 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.

<details>
<summary><strong>Further information on the use of the AGPL open source license</strong></summary>
     
### Are there any legal issues with AGPL 3.0? Is it safe for me to use?

There is absolutely no problem in using a product licensed under AGPL 3.0. Issues with GPL
(or AGPL) licenses are mostly related with the fact that different people assign different
interpretations on the meaning of the term “derivate work” used in these licenses. Due to this,
some people believe that there is a risk in just _using_ software under GPL or AGPL licenses
(even without _modifying_ it).

For the avoidance of doubt, the owners of this software licensed under an AGPL-3.0 license
wish to make a clarifying public statement as follows:

> Please note that software derived as a result of modifying the source code of this
> software in order to fix a bug or incorporate enhancements is considered a derivative
> work of the product. Software that merely uses or aggregates (i.e. links to) an otherwise
> unmodified version of existing software is not considered a derivative work, and therefore
> it does not need to be released as under the same license, or even released as open source.

</details>
