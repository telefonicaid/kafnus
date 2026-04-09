# ⚙️ Advanced Topics

This document provides advanced operational guidance for Kafnus deployments. It complements the [Operational Guide](/doc/AdvancedTopics/01_operational_guide.md) and the [Kafka Security Guide](/doc/AdvancedTopics/02_security.md), providing references and best practices for running, maintaining, and securing the system.

---

## 1️⃣ Security & Authorization

Kafnus supports optional **authentication** and **authorization** with Kafka. Both **Kafnus NGSI** and **Kafnus Connect** can use SASL mechanisms and enforce ACLs to control access to topics and consumer groups.

For full details, environment variables, ACL examples, and operational recommendations, see the dedicated [Kafka Security Guide](/doc/AdvancedTopics/02_security.md).

> 🔹 Key points for operators:
>
> * Context Broker must have **write access** to raw topics (typically `smc_raw_*`).
> * Kafnus NGSI reads from raw topics and writes/creates processed topics (`smc_*_processed`).
> * Kafnus Connect reads processed topics, writes to error topics (`*_errors`), and requires access to its internal Connect topics (`connect-configs`, `connect-offsets`, `connect-status`).
> * Always define ACLs when `ALLOW_EVERYONE_IF_NO_ACL_FOUND=false` to enforce minimal privilege.

---

## 2️⃣ Service Management

Refer to the [Operational Guide](/doc/AdvancedTopics/01_operational_guide.md) for complete instructions on:

* Starting and stopping services (`docker-up.sh` / `docker-down.sh`)
* Health checks for Kafka, Kafnus NGSI, Kafnus Connect, PostGIS, and MongoDB
* Log inspection and dynamic log level management via NGSI Admin Server
* Connector management: registering, updating, and deleting sinks
* Multi-tenant deployments: adapting topic prefixes, database schemas, and connectors per service

> 💡 This section provides practical operational commands, but **security considerations are in a separated file** (see Section 1).

---

## 3️⃣ Kafka Topics & Data Routing

Kafnus uses structured topic naming and dynamic routing:

* **Raw Topics:** `<prefix>raw_<flow>` (produced by CB, consumed by NGSI)
* **Processed Topics:** `<prefix><service>_<flow><suffix>` (produced by NGSI, consumed by Connect)
* **Error Topics:** written and consumed by Connect or NGSI for failed messages

### 3.1 PostGIS Sink Routing

* The **HeaderRouter SMT** maps NGSI headers to `schema.table` names dynamically.
* Supported datamodels allow routing by entity type, service path, or error logs.
* Optional suffixes (`_historic`, `_lastdata`, `_mutable`) can be configured.

### 3.2 MongoDB Sink Routing

* Uses the `KAFNUS_NGSI_MONGO_PREFIX` to build database and collection names.
* Prefix ensures multi-tenant isolation (`<prefix><fiware-service>` for DB, `<prefix><fiware-servicepath>` for collection).
* Only one connector per service is recommended; new topics require a connector update for regex-based consumption.

---

## 4️⃣ Verification & Diagnostics

Operators should regularly verify:

* Kafka topic existence and sample messages.
* PostGIS and MongoDB inserts to confirm data persistence.
* Connector health via Kafka Connect REST API (`/connectors/<name>/status`).
* Admin server endpoints (`/health`, `/logLevel`) for NGSI monitoring.

---

## 🧭 Navigation

- [⬅️ Previous: Architecture](/doc/02_architecture.md)
- [🏠 Main index](/README.md#documentation)
- [➡️ Next: Docker](/doc/04_docker.md)
