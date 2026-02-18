# ⚙️ Operational Guide

This document describes the information needed for running and maintaining a Kafnus deployment: starting, stopping, health checks, logs, connector management, and troubleshooting.

---

## ▶️ 1. Starting & Stopping

### 1.1 Start Services

From the project’s `docker/` directory:

```bash
cd docker/
./docker-up.sh
```

– If using an external PostGIS, comment out its compose line in `docker-up.sh`.  
– Ensure the `kafka-postgis-net` network exists (see installation).

### 1.2 Stop Services

```bash
cd docker/
./docker-down.sh
```

This stops all containers and removes volumes & orphaned networks.

---

## 🛡️ 2. Health Checks

### 2.1 Container Status

```bash
docker ps
```

Confirm these are **Up (healthy)**:

```plaintext
kafka           ← Kafka broker
kafnus-connect  ← Kafnus Connect
kafnus-ngsi     ← Kafnus NGSI (Node.js)
orion           ← Context Broker
mongo           ← MongoDB
iot-postgis     ← PostGIS (if internal)
```

### 2.2 Check Connector Health

List connectors and ensure tasks are running:

```bash
curl -s http://localhost:8083/connectors | jq .
```

For each connector:

```bash
curl -s http://localhost:8083/connectors/<name>/status | jq .
```

### 2.3 Admin Server Endpoints & Health Check

Kafnus-NGSI exposes an **Admin HTTP server** on `KAFNUS_NGSI_ADMIN_PORT` (default `8000`) with `health` endpoint:

**Health check:**

```bash
curl -s http://localhost:8000/health | jq .
```

Expected response:

```json
{
  "status": "UP",
  "timestamp": "2025-12-02T10:15:32.123Z"
}
```

> ✅ A valid JSON response confirms the Admin Server is running.
> ❌ If the request fails, check the container logs (`docker logs -f kafnus-ngsi`) and ensure `KAFNUS_NGSI_ADMIN_PORT` is correctly set.

---

### 2.4 Ports Overview (Optional Table for Operators)

| Service        | Default Port | Purpose                                           |
| -------------- | ------------ | ------------------------------------------------- |
| Kafka          | 9092         | Broker                                            |
| Kafnus Connect | 8083         | Connect REST API                                  |
| Orion          | 1026         | Context Broker                                    |
| MongoDB        | 27017        | Database                                          |
| PostGIS        | 5432         | Database                                          |
| Kafnus-NGSI    | 8000         | Admin Server (`/metrics`, `/logLevel`, `/health`) |

> 💡 If `admin.port` is changed in the configuration, update the URLs accordingly for health checks, metrics, or log level operations.

---

## 🔍 3. Logs & Diagnostics

Still in progress...

### 3.1 View Container Logs

Tail logs for quick debugging:

```bash
docker logs -f kafnus-connect
docker logs -f kafnus-ngsi
docker logs -f iot-postgis
```

### 3.2 Kafnus Connect Errors

– Failed connector loads appear in `kafnus-connect` logs.  
– DLQ errors land in the topic `raw_errors`. To inspect:

```bash
docker exec -it kafka \
  /opt/kafka/bin/kafka-console-consumer.sh \
    --bootstrap-server kafka:9092 \
    --topic raw_errors \
    --from-beginning \
    --max-messages 10
```

### 3.3 Admin Server & Log Level Management

Kafnus-NGSI exposes an **Admin HTTP endpoint** to inspect and modify the log level at runtime. This is **separate from metrics** and runs on the port defined in the configuration (`admin.port`, default `8000`).

**Check current log level:**

```bash
curl -s http://localhost:8000/logLevel | jq .
```

Response:

```json
{ "level": "INFO" }
```

**Change log level on the fly:**

```bash
curl -X POST -H "Content-Type: application/json" \
     -d '{"level": "debug"}' \
     http://localhost:8000/logLevel | jq .
```

Response:

```json
{ "ok": true, "level": "DEBUG" }
```

> ⚠️ Valid levels: `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`.
> Changes are **effective immediately**, no need to restart the service.

This endpoint is useful for troubleshooting without disrupting production flows or stopping Kafnus-NGSI.
The Admin server is started automatically when launching the service (via `startAdminServer` in the main process).

---

## 🔄 4. Connector Management

### 4.1 Register a Connector

From project root `tests_end2end/sinks/`:

```bash
cd tests_end2end/sinks/
curl -X POST -H "Content-Type: application/json" \
     --data @pg-sink-historic.json \
     http://localhost:8083/connectors
```

Repeat for `pg-sink-lastdata.json`, `pg-sink-mutable.json`, `pg-sink-errors.json`, `mdb-sink.json` and `http-sink.json`.

> You can also do this for `mdb-sink-errors.json` and `http-sink-errors.json`, but this connectors may change in the future.

### 4.2 Update Connector Config

Use HTTP PUT to update a running connector:

```bash
curl -X PUT -H "Content-Type: application/json" \
     --data @my-updated-config.json \
     http://localhost:8083/connectors/<name>/config
```

> **Note:** In the update case, the name must not be present in the config.json


### 4.3 Delete a Connector

```bash
curl -X DELETE http://localhost:8083/connectors/<name>
```

### 4.4 Multi-Tenant / Multi-Client Usage

The provided sink configurations (`pg-sink-historic.json`, `pg-sink-lastdata.json`, `pg-sink-mutable.json`,  
`pg-sink-errors.json`, `mdb-sink.json` and `http-sink.json`) as well as the example test scenarios under  
`/tests_end2end/functional/cases` are **designed to work with a single tenant (fiware-service) named `test`**.

If you want to onboard additional clients (e.g. `smartcity1`, `smartcity2`), you need to create a **separate set of sinks** for each tenant. This usually involves:

- Copying the base sink configuration JSON files
- Replacing the `config.topic` prefixes (each tenant uses isolated Kafka topics)
- Replacing the `config.table.name.format` prefixes (so each tenant persists to its own DB schemas/tables)
- Reviewing DB connection options if different PostGIS/Mongo instances are used (check for `config.connection.url`)

Once adapted, register the new connector set using the same process (`curl -X POST ...`).

> 💡 Example: You would typically have one set of sinks (`pg-sink-historic`, `pg-sink-lastdata`, `pg-sink-mutable`,  
> `pg-sink-errors`...) for **`smartcity1`**, and another equivalent set for **`smartcity2`**.  
> Each set handles only its own tenant’s traffic.

### 4.5 Regex Topics Caveat for Mongo Sink

The MongoDB sink connector can be configured either with a **static list of topics** (`topics`) or with a **regular expression** (`topics.regex`).  

⚠️ **Important:**  
You cannot configure both `topics` and `topics.regex` at the same time — the connector will fail to start if both are present.  

When using `topics.regex`, the matching is performed **only once at startup**.  
Any topics created later that match the regex will **not** be processed automatically.

To make the connector start consuming new topics, you must either:

1. **Redeploy the connector**, or  
2. **Update its configuration** via a `PUT` to the connector’s `/config` endpoint (this effectively refreshes the regex evaluation).  

Example update command:

```bash
curl -X PUT -H "Content-Type: application/json" \
     --data @mdb-sink.json \
     http://localhost:8083/connectors/mongo-sink/config
```

⚠️ **Operational Note:**  
This needs to be clearly documented as part of the onboarding process for new tenants/services.  

- For **PostGIS**, the current approach is to spin up one connector per service.  
- For **MongoDB**, two alternatives exist:  
  - adopt the same per-service connector strategy, or  
  - require a connector update (via `PUT`) whenever a new topic needs to be consumed.

---

### 4.6 Configuring HeaderRouter SMT for PostGIS

The **HeaderRouter** Single Message Transform (SMT) is responsible for dynamically determining the schema and table names for PostGIS persistence based on NGSI headers and a configurable datamodel.

#### What is HeaderRouter?

HeaderRouter intercepts messages in transit and:

1. Reads NGSI headers (`fiware-service`, `fiware-servicepath`, `entityType`, etc.)
2. Applies a **datamodel** to compute `schema.table`
3. Overwrites the Kafka topic with this value
4. The JDBC Sink then uses standard `table.name.format: ${topic}` to write to the correct table

This decouples **NGSI** (which remains schema-agnostic) from **SQL routing logic** (which is now configurable in Kafka Connect).

#### Supported Datamodels

| Datamodel | Schema | Table | Use Case |
|-----------|--------|-------|----------|
| `dm-by-entity-type-database` | `fiware-service` | `<fiware-servicepath>_<entityType>` | **Primary** – one table per entity type per service path |
| `dm-by-fixed-entity-type-database-schema` | `fiware-servicepath` | `<entityType>` | Pre-created schema with fixed structure |
| `dm-postgis-errors` | `fiware-service` | `<fiware-service>_error_log` | Error/DLQ logging |

#### Example Configuration in Sink JSON

```json
{
  "name": "pg-sink-historic",
  "config": {
    "connector.class": "io.confluent.connect.jdbc.JdbcSinkConnector",
    "topics": "test",
    "connection.url": "jdbc:postgresql://iot-postgis:5432/smartcity",
    "table.name.format": "${topic}",
    "transforms": "HeaderRouter",
    "transforms.HeaderRouter.type": "com.telefonica.HeaderRouter",
    "transforms.HeaderRouter.datamodel": "dm-by-entity-type-database",
    "transforms.HeaderRouter.suffix": "_historic"
  }
}
```

**Key parameters:**

- `transforms.HeaderRouter.datamodel`: Choose from the supported datamodels.
- `transforms.HeaderRouter.suffix`: Optional suffix to append to table names (e.g., `_historic`, `_lastdata`).
- `transforms.HeaderRouter.headers.schema`: Optional override to force a specific schema (useful for tests or multi-schema deployments).

For complete reference, see the [Kafnus Connect documentation](/doc/06_kafnus_connect.md#headerrouter-smt--dynamic-sql-routing).

---

### 4.7 Configuring MongoDB Namespace Prefix

The **MongoDB namespace prefix** (environment variable `KAFNUS_NGSI_MONGO_PREFIX`) determines how database and collection names are built from FIWARE service and service path.

#### Setting the Prefix

In the `docker-compose.ngsi.yml` file (or equivalent environment configuration):

```yaml
environment:
  KAFNUS_NGSI_MONGO_PREFIX: "sth_"
```

- **Default value:** `sth_` (standard Cygnus convention)
- **Type:** string

#### How It's Used

When a Mongo message is processed:

```
Database  = <KAFNUS_NGSI_MONGO_PREFIX><fiware-service>
Collection = <KAFNUS_NGSI_MONGO_PREFIX><fiware-servicepath>
```

**Examples:**

With `KAFNUS_NGSI_MONGO_PREFIX=sth_`:
```
fiware-service=myservice, fiware-servicepath=/sensors
→ Database: sth_myservice
→ Collection: sth_sensors
```

With `KAFNUS_NGSI_MONGO_PREFIX=custom_`:
```
fiware-service=myservice, fiware-servicepath=/sensors
→ Database: custom_myservice
→ Collection: custom_sensors
```

#### Current Limitations & Future Plans

- ✅ Global prefix: configurable per deployment
- ❌ Per-service prefix: not yet supported
- 🔄 See [Issue #179](https://github.com/telefonicaid/kafnus/issues/179) for service-level prefix support

For more details, see [MongoDB Namespace Prefix Configuration](/doc/05_kafnus_ngsi.md#mongodb-namespace-prefix-configuration) in the Kafnus NGSI documentation.

---

## 📊 5. Topic & Data Verification

### 5.1 Inspect Topics

List topics:

```bash
docker exec kafka kafka-topics --list --bootstrap-server kafka:9092
```

Consume a sample:

```bash
docker exec kafka \
  /opt/kafka/bin/kafka-console-consumer.sh \
    --bootstrap-server kafka:9092 \
    --topic <topic-name> \
    --from-beginning \
    --max-messages 5
```

### 5.2 Verify DB Inserts

Connect to PostGIS:

```bash
docker exec -it iot-postgis psql -U postgres -d tests
```

Run SQL:

```sql
SELECT * FROM test.simple_sensor LIMIT 5;
```

---

## ⚠️ 6. Common Issues & Fixes

- **Connector won't start**  
  Check plugins are available in `kafnus-connect`.  
- **Port conflicts**  
  Ensure no other service is using ports 9092, 8083, 1026, 1883, 5432, 27017.  
- **Network not found**  
  Create `kafka-postgis-net`:  
  ```bash
  docker network create kafka-postgis-net
  ```  
- **JMX agent mount fails**  
  Ensure `kafnus-connect/monitoring/jmx_prometheus_javaagent.jar` is a file, not directory, and path has no spaces.

---

## 🧭 Navigation

- [⬅️ Back: Advanced Topics](/doc/03_advanced_topics.md)

