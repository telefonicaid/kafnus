# ⚙️ Kafnus NGSI Stream Processor (Node.js)

This document explains the role of the Kafnus NGSI application in Kafnus: how it transforms NGSIv2 notifications from Kafka into structured messages ready to be persisted via Kafnus Connect.

---

## 🧠 Overview

Kafnus NGSI (Node.js) is a **Kafka stream processor** that:

- Decodes and processes NGSIv2 notifications.
- Adds metadata like `recvTime`.
- Converts geo attributes (`geo:*`) to **PostGIS-compatible WKB**.
- Builds messages compatible with **Kafnus Connect**.
- Publishes to **dynamic Kafka topics** using headers and entity metadata.

---

## 🔧 Configuration

### Main Entry Point

- The main entry point is `kafnus-ngsi/index.js`.
- Broker: `kafka:9092`
- Metrics are exposed via Prometheus-compatible endpoints.
- LogLevel is exposed in http endpoint.

### Launch command (in Docker):

```bash
docker build --no-cache -t kafnus-ngsi .
docker run --env-file .env kafnus-ngsi
```

### **Logging**

The Node.js processor uses structured logging to track processing flow, entity transformations, and message routing.

**Supported log levels:**

- `DEBUG`: Detailed internals (entity parsing, Kafka key/schema generation).
- `INFO`: Normal operation (successful sends to topics, startup lifecycle).
- `WARN`: Recoverable issues (e.g., invalid geo formats).
- `ERROR`: Parsing failures or bad input payloads.

ℹ️ The environment variable `KAFNUS_NGSI_LOG_LEVEL` controls the verbosity, set the variable in [`/docker/docker-compose.ngsi.yml`](/docker/docker-compose.ngsi.yml).  
Defaults to `INFO` if not set.

Example log output:

```
time=2025-09-03T11:38:21.432Z | lvl=INFO | corr=n/a | trans=n/a | op=n/a | ver=0.0.1 | ob=ES | comp=Kafnus | msg=[historic] Sent to topic 'test' (table: 'limit_sensor'): Sensor:LimitTest:12
```

#### Admin Server & Log Level

Kafnus-NGSI exposes an **Admin HTTP endpoint** on `KAFNUS_NGSI_ADMIN_PORT` (default `8000`) to inspect or change the log level at runtime. Set the variable in [`/docker/docker-compose.ngsi.yml`](/docker/docker-compose.ngsi.yml).

**Check current log level:**

```bash
curl -s http://localhost:8000/logLevel | jq .
```

**Change log level:**

```bash
curl -X POST -H "Content-Type: application/json" \
     -d '{"level": "DEBUG"}' \
     http://localhost:8000/logLevel
```

> ⚠️ Levels: `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`. Changes are **immediate**.

**Health check:**
A valid JSON response confirms the Admin Server is running. If it fails, check the `kafnus-ngsi` container logs and `KAFNUS_NGSI_ADMIN_PORT` setting.

---

## 📥 Topics Consumed

| Source Type | Table Name         | Consumer Agent              |
|-------------|------------------|----------------------------|
| Historic (PostGIS) | `raw_historic`     | `historicConsumerAgent.js` |
| Lastdata (PostGIS) | `raw_lastdata`     | `lastdataConsumerAgent.js` |
| Mutable (PostGIS)  | `raw_mutable`      | `mutableConsumerAgent.js` |
| Errors (PostGIS)   | `raw_errors`       | `errorsConsumerAgent.js` |
| Mongo              | `raw_mongo`        | `mongoConsumerAgent.js` |
| HTTP               | `raw_sgtr`         | `sgtrConsumerAgent.js` |

---

## 📤 Topics Produced

- `<fiware_service>` → processed historic  
- `<fiware_service>_lastdata` → processed lastdata  
- `<fiware_service>_mutable` → processed mutable  
- `<db_name>_error_log` → DLQ-parsed errors  
- Mongo output topics: `sth_<fiware_service>_<servicepath>`  
- HTTP output topic: `test_http`  
- Topic names are dynamic, based on Kafka record headers and entity metadata.

---

## Postgis Agents

### 🔄 Processing Flow

The core function is `handleEntityCb` in `lib/utils/handleEntityCb.js`:

1. Parse the input notification.
2. Add `recvtime`.
3. Convert `geo:*` attributes to WKB (PostGIS only).
4. Build Kafnus Connect schema and payload.
5. Send to output topic.
6. Set header: `target_table = table_name`.

```js
async function handleEntityCb(
    logger,
    rawValue,
    {
        headers = [],
        datamodel = 'dm-by-entity-type-database',
        suffix = '',
        includeTimeinstant = true,
        keyFields = null
    } = {},
    producer
)
```

---

### 🧬 Field Type Inference

The function `inferFieldType` (see `lib/utils/ngsiUtils.js`) is responsible for converting NGSIv2 attributes (including their optional `attrType`) into Kafka Connect-compatible field types and processed values.

This function always returns a tuple:

```js
function inferFieldType(name, value, attrType = null)
```

#### 🔍 Behavior by `attrType` and JS-native inference:

| Mechanism / Source              | Kafka Connect Type                                | Notes                                                                 |
|---------------------------------|---------------------------------------------------|-----------------------------------------------------------------------|
| `geo:json` (`attrType`)         | `"geometry"`                                      | Processed externally as PostGIS-compatible geometry.                   |
| `DateTime`, `ISO8601` (`attrType`) | Kafka `Timestamp` schema (`int64`)             | Converted to epoch millis, **except** `timeInstant` and `recvTime` which remain strings. |
| JS-native string value          | `"string"`                                        | Any value inferred as string is passed through as-is.                  |
| JS-native boolean value         | `"boolean"`                                       |                                                                       |
| JS-native number value          | `"double"`                                        | All numeric values are handled as JS float64 (double precision).       |
| JS-native object/array          | `"string"` (JSON)                                 | Serialized to JSON string.                                            |
| Unknown / untyped value         | `"string"`                                        | Fallback for unsupported types or nulls.                               |

#### ⚠️ Null handling

- All `null` or `undefined` values are normalized to `['string', null]`.  
- This guarantees schema compatibility in Kafka Connect.  
- For numeric columns, constraint errors (e.g. `NOT NULL`) are raised correctly by the sink connector.

#### ⚠️ Simplifications

- Unlike earlier versions, **no attempt is made to distinguish between `int32`, `int64`, and `double`**.  
  All numbers are treated as **`double`** for consistency and simplicity.  
- Only **`DateTime/ISO8601`** and **`geo:json`** are treated as special types.  
- All other NGSI attributes are mapped directly to their JS-native type or serialized as strings.

#### ⚠️ Known Limitations

- JavaScript numbers are IEEE-754 doubles. Values above ~`9e15` may lose precision, but this is acceptable since PostgreSQL sinks typically use `double`.  
- Invalid dates or malformed JSON are logged and tryed to store as strings.  

---

### 🕒 DateTime Handling

Special treatment is applied to datetime fields to ensure compatibility and clarity across the entire data pipeline.

#### ✅ `timeinstant` and `recvtime`

The fields `timeinstant` and `recvtime` are **always sent as ISO 8601 strings**.

- This keeps logs, metrics, and downstream queries human-readable.
- Transformation into proper timestamp columns is handled by the Kafka Connect JDBC Sink.

This decision simplifies validation, debugging, and filtering across tools like PostGIS and Prometheus.

Example:

```json
"timeinstant": "2025-07-31T10:12:00Z"
```

#### 🧪 Other `DateTime` fields

For all other datetime attributes, values are converted to **epoch milliseconds** and wrapped in a Kafka Connect timestamp schema:

```js
// Use Kafka Connect Timestamp logical type
return [{ type: 'int64', name: 'org.apache.kafka.connect.data.Timestamp' }, toEpochMillis(value)];
```

This allows the timestamp to be interpreted natively by sinks like JDBC without requiring connector configuration.

The datetime parsing logic can be found in `lib/utils/ngsiUtils.js`.

---

### 🌍 Geometry Transformation

Geo attributes, only inside `geo:json`, are converted to **WKB** for PostGIS. The logic uses Shapely, GeoJSON and WKT/WKB translation. This has been implemented thanks to this [PR](https://github.com/confluentinc/kafka-connect-jdbc/pull/1048).

Example:

```js
function toWkbStructFromWkt(wktStr, fieldName, srid = 4326) {
    /**
     * Converts a WKT geometry string to a Debezium-compatible WKB struct with schema and base64-encoded payload.
     * Used for sending geo attributes in Kafnus Connect format.
     */
    ...

function toWktGeometry(attrType, attrValue) {
    /**
     * Converts NGSI geo attributes (geo:point, geo:polygon, geo:json) to WKT string.
     * Supports extension for additional geo types if needed.
     */
    ...
```

The resulting field is base64-encoded and embedded in the Kafnus Connect payload.

---

### 🗝️ Kafka Message Key

Each record includes a structured key, depending on the flow:

```js
function buildKafkaKey(entity, keyFields, includeTimeinstant = false) {
    /**
     * Builds the Kafka message key with schema based on key_fields and optionally timeinstant.
     * This key is used for Kafnus Connect upsert mode or primary key definition.
     */
    ...
```

Useful for upsert operations in JDBC sinks (`lastdata`, `mutable`).

---

### 🧠 Flows and Behaviors

#### `raw_historic`

- All notifications are sent downstream regardless of timestamp.
- Output topic: `<service>`

#### `raw_lastdata`

- Maintains a Faust Table `last_seen_timestamps` to filter old records.
- Sends only newer TimeInstant values.
- Output topic: `<service>_lastdata`

#### `raw_mutable`

- Allows overwriting/updating mutable data.
- Update rows with same `entityid` and `timeinstant`.
- Output topic: `<service>_mutable`

---

### 🚨 DLQ Handling (`raw_errors`)

Kafnus NGSI parses Kafnus Connect DLQ messages and reconstructs error logs:

```js
async function startErrorsConsumerAgent(logger) {
    /**
     * Processes Kafnus Connect error messages from the 'raw_errors' topic.
     * Parses failed inserts or connector issues, extracts the relevant SQL error message and context,
     * and emits a structured error log message to a per-tenant error topic (e.g., 'clientname_error_log').
     */
    ...
```

Output schema:

```json
{
  "timestamp": "2025-05-28T09:00:00Z",
  "error": "ERROR: duplicate key value violates unique constraint",
  "query": "INSERT INTO ..."
}
```

These are published to topics like `<dbname>_error_log`.

---

## Mongo Agent

- Maps `Fiware-Service` and `Fiware-ServicePath` to database and collection names.
- Each entity in `message.data` produces a **document**.
- Example document structure:

```json
{
  "entityId": "Device:001",
  "entityType": "Device",
  "temperature": 25.3,
  "recvTime": "2025-09-19T09:32:11.000Z",
  "recvTimeTs": "1758274331000",
  "TimeInstant": "2025-06-26T11:00:00.000Z"
}
```

- Output topic is dynamic, named as `<Fiware-Service>_mongo` by default
- Database is `sth_<encoded Fiware-Service>`.
- Collection is `sth_<encoded Fiware-ServicePath>`.

---

## HTTP Agent (`sgtrConsumerAgent.js`)

- Consumes `raw_sgtr` and produces HTTP-compatible output (`test_http`).
- Generates GraphQL mutations per entity using `buildMutationCreate`.

---


## Docker environment variables for kafnus-ngsi:

| Environment Variable              | Type     | Default Value     | Description                                                                 |
|----------------------------------|----------|-------------------|-----------------------------------------------------------------------------|
| `KAFNUS_NGSI_KAFKA_BROKER`       | string   | `kafna:9092`  | Address of the Kafka broker the service will connect to.                    |
| `KAFNUS_NGSI_GROUP_ID`           | string   | `ngsi-processor`  | Kafka consumer group ID used by the NGSI processor.                         |
| `KAFNUS_NGSI_LOG_LEVEL`          | string   | `INFO`           | Logging level for the application (`INFO`, `WARN`, `ERROR`, `DEBUG`).       |
| `KAFNUS_NGSI_LOG_OB`             | string   | `ES`              | Origin or location tag used in logs.                                        |
| `KAFNUS_NGSI_LOG_COMP`           | string   | `Kafnus-ngsi`     | Component name used in log messages.                                        |
| `KAFNUS_NGSI_ADMIN_PORT`         | number   | `8000`            | Port where the admin or health-check server will listen.                    |
| `KAFNUS_NGSI_SECURITY_PROTOCOL`  | string   | `plaintext`       | Kafka security protocol (e.g., `plaintext`, `SASL_PLAINTEXT`, `SASL_SSL`).  |
| `KAFNUS_NGSI_SASL_MECHANISMS`    | string   | `PLAIN`           | SASL mechanism for Kafka authentication.                                    |
| `KAFNUS_NGSI_SASL_USERNAME`      | string   | `null`            | Username for SASL authentication (if enabled).                              |
| `KAFNUS_NGSI_SASL_PASSWORD`      | string   | `null`            | Password for SASL authentication (if enabled).                              |
| `KAFNUS_NGSI_AUTO_OFFSET_RESET`  | string   | `earliest`        | Kafka offset reset policy (`earliest`, `latest`).                           |
| `KAFNUS_NGSI_GRAPHQL_GRAFO`      | string   | `grafo_v_120`      | Graph name or version used by the GraphQL service.                          |
| `KAFNUS_NGSI_GRAPHQL_SLUG_URI`   | boolean  | `false`           | Enables or disables slug-based GraphQL URIs.                                |
| `KAFNUS_NGSI_PREFIX_TOPIC`       | string   | ``        | Prefix used in all kafka topics (by default no prefix is used).                           |
| `KAFNUS_NGSI_SUFFIX_TOPIC`       | string   | ``        | Suffix used in all kafka topics (by default no suffix is used).                           |
---


## 🧭 Navigation

- [⬅️ Previous: ](/doc/04_docker.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Kafnus-Connect](/doc/06_kafnus_connect.md)
