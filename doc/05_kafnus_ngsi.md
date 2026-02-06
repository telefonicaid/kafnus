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


## ⚖ Design Decisions: Kafka Processing Semantics

This section describes the key architectural decisions adopted in the Kafka processing layer to ensure reliability, stability, and predictable behavior under load.

---

### 🔁 Manual Offset Management (Explicit Commits)

All Kafka consumers use **manual offset commits** (`enable.auto.commit = false`).

Offsets are committed **explicitly and only after successful processing** of each message.  
This provides **at-least-once delivery semantics** and avoids silent data loss.

**Commit strategy:**

- Offsets are committed **after all side effects are completed**, typically:
  - After producing downstream Kafka messages.
  - After completing all per-message transformations.
- Offsets are **not committed** if:
  - JSON parsing fails (when the message may be retried).
  - Producer backpressure occurs.
  - Any exception happens during processing.
- Non-recoverable messages (e.g. malformed JSON in DLQ flows) are committed immediately to avoid infinite retries.

This strategy guarantees:
- No message is acknowledged before it is safely handled.
- Failures result in controlled retries.
- Processing remains deterministic and debuggable.

---

### 🧵 Single Global Kafka Producer

The application uses a **single shared Kafka producer instance** across all consumer agents.

**Rationale:**

- Kafka producers are **thread-safe** and designed to handle multiple topics and partitions.
- A single producer:
  - Reduces open TCP connections and memory usage.
  - Centralizes batching, retries, and delivery reports.
  - Prevents local queue exhaustion caused by multiple independent producers.
- Topics are selected dynamically per message, so producing to multiple topics is fully supported.

This design improves stability under load and simplifies lifecycle management, especially during shutdown.

---

### 🚦 Backpressure and Flow Control

To prevent overload and uncontrolled memory growth, explicit backpressure mechanisms are applied:

- Message processing is **serialized per consumer** using an internal queue (`p-queue`).
- When the producer local queue is full (`Local: Queue full`):
  - The Kafka consumer is **paused**.
  - Processing resumes automatically once the producer drains.
- No offsets are committed while backpressure is active.

This ensures:
- The system adapts naturally to downstream throughput.
- Kafka is not overwhelmed by uncontrolled produce calls.
- Memory usage remains bounded.

---

### 🔌 Graceful Shutdown Semantics

On shutdown signals (`SIGINT`, `SIGTERM`), the application performs a controlled shutdown:

1. Consumers are paused to stop fetching new messages.
2. In-flight messages complete processing.
3. The global producer is flushed to ensure all messages are delivered.
4. Consumers and producer are disconnected cleanly.
5. The process exits only after all resources are released.

This avoids:
- Message loss.
- Partial writes.
- Segmentation faults caused by pending delivery callbacks.

---

### ✅ Resulting Guarantees

With these decisions, Kafnus NGSI provides:

- **At-least-once delivery**
- **Controlled retries**
- **Stable behavior under load**
- **Predictable shutdown**
- **No silent data loss**

These trade-offs favor correctness and operational safety over raw throughput, which is aligned with the requirements of NGSI data processing and persistence pipelines.

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
| Historic (PostGIS) | `<PREFIX>raw_historic`     | `historicConsumerAgent.js` |
| Lastdata (PostGIS) | `<PREFIX>raw_lastdata`     | `lastdataConsumerAgent.js` |
| Mutable (PostGIS)  | `<PREFIX>raw_mutable`      | `mutableConsumerAgent.js` |
| Errors (PostGIS)   | `<PREFIX>raw_errors`       | `errorsConsumerAgent.js` |
| Mongo              | `<PREFIX>raw_mongo`        | `mongoConsumerAgent.js` |
| HTTP (GraphQL)     | `<PREFIX>raw_sgtr`         | `sgtrConsumerAgent.js` |

---

## 📤 Topics Produced

- `<PREFIX><fiware_service>_historic<SUFFIX>` → processed historic  
- `<PREFIX><fiware_service>_lastdata<SUFFIX>` → processed lastdata  
- `<PREFIX><fiware_service>_mutable<SUFFIX>` → processed mutable  
- `<PREFIX><db_name>_error_log<SUFFIX>` → DLQ-parsed errors  
- Mongo output topics: `<MONGO_PREFIX><fiware_service>_mongo<SUFFIX>`  
- HTTP output topic: `<PREFIX>sgtr_http<SUFFIX>` or `<PREFIX><fiware_service>_sgtr_http<SUFFIX>` depending on configuration boolean flag `KAFNUS_NGSI_GRAPHQL_OUTPUT_TOPIC_BY_SERVICE`.
- Topic names are dynamic, based on Kafka record headers and entity metadata.

---

## Postgis Agents

### Overview & Design Philosophy

The PostgreSQL/PostGIS agents are responsible for **transforming NGSI data** but are explicitly **agnostic to SQL schema details**. 

Since PR #182 ([Adapt Changes Header Router](https://github.com/telefonicaid/kafnus/pull/182)), the architecture follows a clear separation of concerns:

- **Kafnus NGSI**: Emits only **NGSI standard headers** and metadata
  - No longer calculates table names or schema logic
  - Produces to topics based on FIWARE service and data flow
- **Kafnus Connect & HeaderRouter SMT**: Handles **all SQL routing decisions**
  - Determines schema and table names dynamically
  - Applies datamodel-specific logic
  - Configurable without modifying NGSI code

This design enables:
- Multi-tenant deployments
- Multiple SQL schemas/layouts per service
- Variable datamodels without code changes
- Clear responsibility boundaries

### 🔄 Processing Flow

The core function is `handleEntityCb` in `lib/utils/handleEntityCb.js`:

1. Parse the input notification.
2. Add `recvtime`.
3. Convert `geo:*` attributes to WKB (PostGIS only).
4. Build Kafnus Connect schema and payload.
5. Send to output topic.
6. Set NGSI-standard headers for routing (not SQL-specific headers).

```js
async function handleEntityCb(
    logger,
    rawValue,
    {
        headers = [],
        suffix = '',
        includeTimeinstant = true,
        keyFields = null
    } = {},
    producer
)
```

---

### Postgis Agents - Detailed Behavior

The core function is [`handleEntityCb` in `lib/utils/handleEntityCb.js`](/kafnus-ngsi/lib/utils/handleEntityCb.js):

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

#### `<PREFIX>raw_historic`

- All notifications are sent downstream regardless of timestamp.
- Output topic: `<PREFIX><service>_historic<SUFFIX>`

#### `<PREFIX>raw_lastdata`

- Maintains a Faust Table `last_seen_timestamps` to filter old records.
- Sends only newer TimeInstant values.
- Output topic: `<PREFIX><service>_lastdata<SUFFIX>`

#### `<PREFIX>raw_mutable`

- Allows overwriting/updating mutable data.
- Update rows with same `entityid` and `timeinstant`.
- Output topic: `<PREFIX><service>_mutable<SUFFIX>`

---

### 🚨 DLQ Handling (`<PREFIX>raw_errors`)

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

These are published to topics like `<PREFIX><dbname>_error_log<SUFFIX>`.

---

## Mongo Agent

### Overview

- Maps `Fiware-Service` and `Fiware-ServicePath` to database and collection names via Kafka record headers.
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

- Output topic is dynamic, named as `<PREFIX><fiware_service>_mongo<SUFFIX>` (example: `smc_myservice_mongo_processed`)
- **Database name header:** Derived from `Fiware-Service` (without prefix at this stage)
- **Collection name header:** Derived from `Fiware-ServicePath` (without prefix at this stage)

### MongoDB Namespace Prefix Configuration

#### Background & Evolution

Historically, MongoDB database and collection names used a hardcoded `sth_` prefix directly in the Kafnus NGSI code. This made it impossible to adapt MongoDB namespaces to different environments without code changes.

**Problem:** The MongoDB Kafka Sink connector does **not support dynamic prefix composition** in its configuration (see [MongoDB Kafka Connector Documentation](https://www.mongodb.com/docs/kafka-connector/current/sink-connector/configuration-properties/mongodb-namespace/)). Namespace mapping can only use field values as-is.

#### Solution: MongoNamespacePrefix SMT (Current)

As of the latest update, prefix handling has been **moved from Kafnus NGSI to Kafka Connect**, following the same architectural pattern as JDBC with `HeaderRouter`.

**The Kafnus NGSI Mongo Agent now:**

1. Emits database and collection names **without prefixes** in Kafka record headers
2. Passes these headers unchanged to Kafka Connect
3. Does **not** apply any prefix logic

**The Kafnus Connect pipeline then:**

1. Applies the **`MongoNamespacePrefix` SMT** (custom Single Message Transform)
2. Reads database and collection names from headers
3. Prepends the configured prefix to each value
4. Rewrites the headers with the final, prefixed namespace values
5. Passes them to the MongoDB Sink connector

This approach:
- ✅ Separates concerns: NGSI is namespace-agnostic
- ✅ Centralizes all persistence logic in Kafka Connect
- ✅ Aligns MongoDB routing with JDBC routing patterns
- ✅ Allows per-service or per-deployment prefix customization via Kafka Connect

#### Configuration

The prefix is now configured in the **Kafka Connect sink connector definition**:

```json
{
  "name": "mongodb-sink",
  "transforms": "MongoPrefix",
  "transforms.MongoPrefix.type": "com.telefonica.MongoNamespacePrefix",
  "transforms.MongoPrefix.database.prefix": "sth_",
  "transforms.MongoPrefix.collection.prefix": "sth_"
}
```

See [MongoNamespacePrefix SMT documentation](/doc/06_kafnus_connect.md#-mongonamespaceprefix-smt--dynamic-mongodb-namespace-routing) for full configuration details.

#### Historical Note: KAFNUS_NGSI_MONGO_PREFIX (Deprecated)

Prior to this change, the environment variable `KAFNUS_NGSI_MONGO_PREFIX` was used to configure the prefix at the NGSI level. This is now **deprecated** in favor of the Kafka Connect SMT approach.

The requirement identified in **Issue #179** is to support a **MongoDB prefix configurable per FIWARE service**, rather than a single global prefix shared by all services.

**Status:**
- ✅ Hardcoded MongoDB prefix removed
- ✅ Prefix made configurable at application level (global)
- ❌ Prefix not yet configurable per FIWARE service
- 🔄 Issue #179 remains open to define and implement service-level prefix support

---

## HTTP Agent (`sgtrConsumerAgent.js`)

- Consumes `<PREFIX>raw_sgtr` and produces HTTP-compatible output (`<PREFIX><fiware_service>_sgtr_http<SUFFIX>`) when KAFNUS_NGSI_GRAPHQL_OUTPUT_TOPIC_BY_SERVICE is true, otherwise output is (`<PREFIX>sgtr_http<SUFFIX>`).
- Generates GraphQL mutations per entity using `buildMutationCreate`, `buildMutationCreate`, `buildMutationUpdate`, `buildMutationDelete`.

These mutations, like:
```
{
  query:
    mutation {
      deleteData(dti: "grafo", uris: ["http://endpoint/grafo/resource/Class1"])
    }
}
```
contains a dti defined by default as `grafo` by `KAFNUS_NGSI_GRAPHQL_GRAFO` env conf and could be extended to `grafo_<fiware_service>` enabling boolean flag option `KAFNUS_NGSI_GRAPHQL_GRAFO_BY_SERVICE`.


---

## 🐳 Docker environment variables for kafnus-ngsi

The following environment variables configure Kafka connectivity, producer/consumer behavior, logging, security, and component-specific settings.

---

### 🔧 General

| Environment Variable | Type | Default Value | Description |
|---------------------|------|---------------|-------------|
| `NODE_ENV` | string | `development` | Application environment (`development` or `production`). |
| `KAFNUS_NGSI_KAFKA_BROKER` | string | `kafka:9092` | Address of the Kafka broker the service connects to. |
| `KAFNUS_NGSI_GROUP_ID` | string | `ngsi-processor` | Base Kafka consumer group ID used by NGSI processor agents. |
| `KAFNUS_NGSI_PREFIX_TOPIC` | string | `` | Prefix used in all kafka topics (by default no prefix is used). |
| `KAFNUS_NGSI_SUFFIX_TOPIC` | string | `` | Suffix used in all kafka topics (by default no suffix is used). |

---

### 📤 Kafka Producer Configuration

These variables control reliability, batching, retries, compression, and local buffering of the **global shared Kafka producer**.

| Environment Variable | Type | Default Value | Description |
|---------------------|------|---------------|-------------|
| `KAFNUS_NGSI_ACKS` | string | `all` | Required acknowledgements for producer (`0`, `1`, `all`). |
| `KAFNUS_NGSI_ENABLE_IDEMPOTENCE` | boolean | `true` | Enables idempotent producer to avoid duplicate writes. |
| `KAFNUS_NGSI_RETRIES` | number | `10` | Number of retry attempts for failed produce requests. |
| `KAFNUS_NGSI_RETRY_BACKOFF_MS` | number | `300` | Backoff time between retries (ms). |
| `KAFNUS_NGSI_LINGER_MS` | number | `50` | Time to wait for batching messages before sending (ms). |
| `KAFNUS_NGSI_BATCH_NUM_MESSAGES` | number | `10000` | Maximum number of messages per batch. |
| `KAFNUS_NGSI_BATCH_SIZE` | number | `131072` | Maximum batch size in bytes (128 KB). |
| `KAFNUS_NGSI_QUEUE_BUFFERING_MAX_MESSAGES` | number | `300000` | Maximum number of messages buffered locally by the producer. |
| `KAFNUS_NGSI_QUEUE_BUFFERING_MAX_KBYTES` | number | `524268` | Maximum producer buffer memory in KB (~512 MB). |
| `KAFNUS_NGSI_QUEUE_BUFFERING_MAX_MS` | number | `0` | Maximum time a message may stay in the local queue (ms). |
| `KAFNUS_NGSI_REQUEST_TIMEOUT_MS` | number | `30000` | Timeout for broker requests (ms). |
| `KAFNUS_NGSI_DELIVERY_TIMEOUT_MS` | number | `120000` | Maximum time to deliver a message including retries (ms). |
| `KAFNUS_NGSI_COMPRESSION_TYPE` | string | `lz4` | Compression codec used by the producer (`lz4`, `snappy`, `gzip`, `none`). |
| `KAFNUS_NGSI_DR_CB` | boolean | `true` | Enables delivery report callback at producer level. |
| `KAFNUS_NGSI_DR_MSG_CB` | boolean | `true` | Enables per-message delivery report callback. |
| `KAFNUS_NGSI_STATISTICS_INTERVAL_MS` | number | `30000` | Interval for Kafka client statistics emission (ms). |

---

### 📥 Kafka Consumer Configuration

These variables control fetch behavior, session handling, and **manual offset management**.

| Environment Variable | Type | Default Value | Description |
|---------------------|------|---------------|-------------|
| `KAFNUS_NGSI_ENABLE_AUTO_COMMIT` | boolean | `false` | Enables or disables Kafka auto-commit (disabled for manual commits). |
| `KAFNUS_NGSI_AUTO_OFFSET_RESET` | string | `earliest` | Offset reset policy when no committed offset exists. |
| `KAFNUS_NGSI_FETCH_MIN_BYTES` | number | `1` | Minimum bytes per fetch request. |
| `KAFNUS_NGSI_FETCH_WAIT_MAX_MS` | number | `500` | Maximum wait time for fetch requests (ms). |
| `KAFNUS_NGSI_SESSION_TIMEOUT_MS` | number | `30000` | Consumer session timeout (ms). |
| `KAFNUS_NGSI_HEARTBEAT_INTERVAL_MS` | number | `3000` | Heartbeat interval to Kafka broker (ms). |
| `KAFNUS_NGSI_STATISTICS_INTERVAL_MS` | number | `30000` | Interval for consumer statistics emission (ms). |

---

### 🔐 Security (Kafka)

| Environment Variable | Type | Default Value | Description |
|---------------------|------|---------------|-------------|
| `KAFNUS_NGSI_SECURITY_PROTOCOL` | string | `plaintext` | Kafka security protocol (`plaintext`, `SASL_PLAINTEXT`, `SASL_SSL`). |
| `KAFNUS_NGSI_SASL_MECHANISMS` | string | `PLAIN` | SASL authentication mechanism. |
| `KAFNUS_NGSI_SASL_USERNAME` | string | `null` | SASL username (if authentication is enabled). |
| `KAFNUS_NGSI_SASL_PASSWORD` | string | `null` | SASL password (if authentication is enabled). |

---

### 🧩 Component & Runtime

| Environment Variable | Type | Default Value | Description |
|---------------------|------|---------------|-------------|
| `KAFNUS_NGSI_LOG_LEVEL` | string | `INFO` | Logging level (`INFO`, `WARN`, `ERROR`, `DEBUG`). |
| `KAFNUS_NGSI_LOG_OB` | string | `ES` | Origin or location tag included in logs. |
| `KAFNUS_NGSI_LOG_COMP` | string | `Kafnus-ngsi` | Component name used in structured logs. |
| `KAFNUS_NGSI_ADMIN_PORT` | number | `8000` | Port for admin, metrics, health and log-level endpoints. |
| `KAFNUS_NGSI_MONGO_PREFIX` | string | `sth_` | Prefix prepended to MongoDB database and collection names (see [MongoDB Namespace Prefix Configuration](#mongodb-namespace-prefix-configuration)). |
| `KAFNUS_NGSI_GRAPHQL_GRAFO` | string | `grafo` | Graph name or version used by the GraphQL integration. |
| `KAFNUS_NGSI_GRAPHQL_GRAFO_BY_SERVICE`      | boolean   | `false`      | Add '_<service>' to Graph name used by the GraphQL service.                          |
| `KAFNUS_NGSI_GRAPHQL_OUTPUT_TOPIC_BY_SERVICE`      | boolean   | `false`      | Add '<service>_' to outputTopic used by the HTTP connector sink.                          |
| `KAFNUS_NGSI_GRAPHQL_SLUG_URI` | boolean | `false` | Enables slug-based URIs for GraphQL identifiers. |

---

## 🧭 Navigation

- [⬅️ Previous: ](/doc/04_docker.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Kafnus-Connect](/doc/06_kafnus_connect.md)
