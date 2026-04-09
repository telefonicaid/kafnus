# 🔄 Kafnus Connect Overview

Kafnus Connect is the component responsible for persisting the NGSI notifications processed by **Kafnus NGSI** into external data sinks such as **PostGIS**, **MongoDB**, or **HTTP endpoints**.  
It is built upon **Kafka Connect**, and forms part of the modular Kafnus architecture designed to replace **Cygnus** with a more scalable, flexible, and cloud-native ecosystem.

---

## ⚙️ Role in the Kafnus Ecosystem

Within the Kafnus architecture:

1. **Kafnus NGSI** receives notifications from the **Orion Context Broker** and publishes normalized NGSI records into Kafka topics with **NGSI-standard headers**.  
2. **Kafnus Connect** consumes those topics and:
   - Applies **Single Message Transforms (SMTs)** to interpret headers and determine routing
   - Routes the data to persistent sinks (databases or external APIs) using configurable sink connectors
3. Each sink connector can apply additional transformations before writing to its destination.

This modular design allows flexible data routing and storage without modifying the upstream NGSI service.

---

## 🧩 Supported Sink Types

Kafnus Connect currently supports the following sinks:

- **PostGIS (JDBC Sink)** – stores structured entity data into PostgreSQL/PostGIS tables  
- **MongoDB Sink** – persists JSON-based documents  
- **HTTP Sink** – forwards data to REST APIs or external endpoints  

Custom **Single Message Transforms (SMTs)** are available to dynamically route records based on message metadata. The most important is the **HeaderRouter** SMT.

---

## 🧠 HeaderRouter SMT – Dynamic SQL Routing

### Purpose

The **HeaderRouter** SMT (introduced in [PR #13 of kafnus-connect](https://github.com/telefonicaid/kafnus-connect/pull/13)) moves **all SQL routing logic** from NGSI into Kafka Connect.

**Key principle:** NGSI emits only standard NGSI headers and metadata. HeaderRouter uses these headers to determine the final schema and table names according to a **configurable datamodel**.

The effective datamodel can be overridden per record using the `fiware-datamodel` Kafka header.

Resolution order:
1. If `fiware-datamodel` header exists and is not empty → it overrides the configured datamodel
2. Otherwise → the connector-level `transforms.HeaderRouter.datamodel` is used
3. If neither is defined → `dm-by-entity-type-database` is applied as default

### Minimal Configuration

```properties
transforms=HeaderRouter
transforms.HeaderRouter.type=com.telefonica.HeaderRouter
transforms.HeaderRouter.datamodel=dm-by-entity-type-database
```

**How it works:**

1. Reads NGSI-standard headers from the message
2. Constructs `schema.table` based on the datamodel
3. **Overwrites the Kafka topic** with `schema.table`
4. The JDBC Sink uses standard `table.name.format: ${topic}` to write to the correct table

This approach:
- ✅ Preserves NGSI abstraction (no SQL concerns in NGSI)
- ✅ Supports multiple datamodels without code changes
- ✅ Enables multi-tenant and multi-schema deployments
- ✅ Uses standard JDBC Sink configuration

### Supported Datamodels

#### 1. `dm-by-entity-type-database` (Primary)

Most commonly used. Each entity type gets its own table per service.

| Element | Resolved Value |
|---------|---|
| **Schema** | `fiware-service` header value |
| **Table** | `<fiware-servicepath>_<entityType>` |

**Example:**

```
Headers:
  fiware-service: mycompany
  fiware-servicepath: /sensors
  entityType: TemperatureSensor

Resulting topic: mycompany.sensors_temperaturesensor
```

#### 2. `dm-by-entity-type-database-schema`

| Element | Resolved Value |
|---------|---|
| **Schema** | `fiware-servicepath` header value |
| **Table** | `<fiware-servicepath>_<entityType>` |

This model isolates data by service path at schema level instead of service level.

```
Headers:
  fiware-service: mycompany
  fiware-servicepath: /sensors
  entityType: TemperatureSensor

Resulting topic: sensors.sensors_temperaturesensor
```

#### 3. `dm-by-fixed-entity-type-database-schema`

Used for pre-created schema structures where entity type is the table name.

| Element | Resolved Value |
|---------|---|
| **Schema** | `fiware-servicepath` header value |
| **Table** | `<entityType>` |

**Example:**

```
Headers:
  fiware-service: mycompany
  fiware-servicepath: /sensors
  entityType: TemperatureSensor

Resulting topic: sensors.temperaturesensor
```

#### 4. `dm-postgis-errors` (Error DLQ Handling)

Special datamodel for error logs from failed JDBC operations.

| Element | Resolved Value |
|---------|---|
| **Schema** | `fiware-service` header value |
| **Table** | `<fiware-service>_error_log` |

**Example:**

```
Headers:
  fiware-service: mycompany

Resulting topic: mycompany.mycompany_error_log
```

### Flexible Header Resolution

Each field in the HeaderRouter supports flexible resolution:

#### Supported Field Names

- `service` (maps to `fiware-service` header)
- `servicepath` (maps to `fiware-servicepath` header)
- `datamodel` (maps to `fiware-datamodel` header if present)
- `entitytype` (maps to `entityType` header)
- `entityid` (maps to `entityId` header)
- `suffix` (maps to `suffix` header, or static value)
- `schema` (optional override of the final schema)

#### Resolution Algorithm

For each field in the configuration:

1. **If no configuration is provided** → use the default header name
2. **If configuration exists:**
   - If a message header with that name exists → use the header value
   - If no header → treat as a **static literal value**

**Examples:**

```json
{
  "transforms.HeaderRouter.headers.service": "tenant1"
}
```

If header `tenant1` does not exist in the message, the literal string `"tenant1"` becomes the schema name. This enables:
- Single-tenant deployments (fixed schema)
- Multi-tenant deployments (dynamic schema from headers)
- Test environments with overridden schemas

### Table Suffix Support

The HeaderRouter can append a **static or dynamic suffix** to table names:

```properties
# Static suffix
transforms.HeaderRouter.suffix=_historic

# Dynamic suffix from header
# (if 'suffix' header is present in the message)
```

**Behavior:**
- If suffix is configured but header is absent → empty string is used (never `null`)
- Common use cases:
  - `_historic` – for historical data tables
  - `_lastdata` – for last known value tables
  - `_mutable` – for mutable/editable data

### Schema Override (Support for Issue #177)

The HeaderRouter supports **explicit schema override**, resolving the limitation of the JDBC Sink fixed schema behavior.

#### Configuration

```json
{
  "transforms.HeaderRouter.headers.schema": "test_schema"
}
```

#### Behavior

- If configured → **always uses the specified schema**, regardless of datamodel
- If not configured → uses the schema determined by the datamodel

**Example:**

```
datamodel: dm-by-entity-type-database
headers.schema: test_schema

Result: test_schema.servicepath_entityType
```

This directly addresses **Issue #177 – Study support for variable schema in JDBC connectors**, allowing tests and variable deployments to override the schema without changing connector configuration.

### Robustness & Error Handling

- Each datamodel validates its required fields
- Missing mandatory metadata → `ConfigException` at startup
- The SMT does **not implement retries** (delegated to Kafka Connect)
- Failed record routing → sent to connector DLQ for later inspection

---

## 🌱 MongoNamespacePrefix SMT – Dynamic MongoDB Namespace Routing

### Purpose

The **MongoNamespacePrefix** SMT handles a limitation of the MongoDB Kafka Sink connector: it does **not support string composition** (e.g., `prefix + field`) via configuration.

Namespace mapping can only use field values as-is, so any logic for **prefixing database or collection names must be handled before the record reaches the MongoDB Sink**.

**Key principle:** Similar to `HeaderRouter`, this SMT moves **all MongoDB namespace routing logic** into Kafka Connect, keeping upstream components (Kafnus NGSI) agnostic of persistence details.

### How It Works

1. **Reads** the MongoDB database and collection names from Kafka record headers
2. **Prepends** a configurable prefix to each
3. **Writes** the resulting values back to the same headers
4. **Leaves** the Kafka topic unchanged

The MongoDB Sink connector then uses standard `FieldPathNamespaceMapper` configuration:

```properties
transforms=MongoPrefix
transforms.MongoPrefix.type=com.telefonica.MongoNamespacePrefix
transforms.MongoPrefix.database.prefix=sth_
transforms.MongoPrefix.collection.prefix=sth_

# Sink configuration (unchanged)
namespace.mapper=FieldPathNamespaceMapper
namespace.mapper.key.database.field=database
namespace.mapper.key.collection.field=collection
```

### Configuration Parameters

| Parameter | Example | Description |
|-----------|---------|-------------|
| `database.prefix` | `sth_` | Prefix to prepend to database names from headers |
| `collection.prefix` | `sth_` | Prefix to prepend to collection names from headers |

### Example

**Before SMT:**

```
Headers:
  database: myservice
  collection: sensor_data

Message reaches MongoDB Sink with:
  db: myservice
  col: sensor_data
```

**After MongoNamespacePrefix SMT:**

```
Headers:
  database: sth_myservice
  collection: sth_sensor_data

Message reaches MongoDB Sink with:
  db: sth_myservice
  col: sth_sensor_data
```

### Relationship with HeaderRouter

Both SMTs follow the **same architectural principle**:

| Aspect | HeaderRouter (JDBC) | MongoNamespacePrefix (MongoDB) |
|--------|-------|--------|
| **Connector limitation** | JDBC needs fixed topic → table mapping | MongoDB Sink cannot compose namespace strings |
| **Where logic lives** | Kafka Connect SMT | Kafka Connect SMT |
| **Input** | NGSI headers (service, servicepath, entityType) | MongoDB namespace headers (database, collection) |
| **Output** | Physical SQL destination (topic) | Physical MongoDB namespace (headers) |
| **Upstream awareness** | Not required | Not required |

This keeps **all physical persistence logic inside Kafka Connect**, ensuring consistent architecture across JDBC and MongoDB sinks.

---

## 🧱 Deployment and Configuration

Kafnus Connect runs as a standalone **Kafka Connect distributed worker**.  
Its configuration is generated dynamically via the `docker-entrypoint.sh` script based on environment variables defined in the Docker Compose setup.

Connectors are registered automatically or via REST API calls (`POST /connectors`), with their definitions stored as JSON files in the `sinks/` directory.

For example:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  --data @pg-sink-historic.json
```

The environment and plugin structure are fully described in the [kafnus-connect repository](https://github.com/telefonicaid/kafnus-connect)

## 🧪 Testing and Integration

In the Kafnus-NGSI repository, tests include the **Kafnus Connect** service within the multi-service Docker Compose environment.
This enables end-to-end verification — from NGSI ingestion to final data persistence in PostGIS or MongoDB.

Example topics for testing:
- `smc_test_historic_processed`
- `smc_test_lastdata_processed`
- `smc_test_mongo_processed`
- `smc_test_http_processed`

The configuration ensures reproducible and isolated testing environments for all connectors.

---

## 🧭 Navigation

- [⬅️ Previous: Kafnus NGSI](/doc/05_kafnus_ngsi.md)
- [🏠 Main index](/README.md#documentation)
- [➡️ Next: Monitoring](/doc/07_monitoring.md)
