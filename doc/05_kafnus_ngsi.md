
# ⚙️ Kafnus NGSI Stream Processor (Node.js)

This document explains the role of the Kafnus NGSI application in Kafnus: how it transforms NGSIv2 notifications from Kafka into structured messages ready to be persisted via Kafnus Connect. As of September 2025, the Node.js implementation is the official and supported version. The previous Python implementation is deprecated and will be removed in a future release.

---

## 🧠 Overview

Kafnus NGSI (Node.js) is a Kafka stream processor that:

- Decodes and processes NGSIv2 notifications.
- Adds metadata like `recvtime`.
- Transforms geo attributes into PostGIS-compatible WKB.
- Builds Kafnus Connect-compatible records with key/schema/payload.
- Sets headers like `target_table` to control downstream routing via SMT.

---

## 🔧 Configuration

### Main entry point

- The main entry point is `kafnus-ngsi/index.js`.
- Broker: `kafka:9092`
- Metrics are exposed via Prometheus-compatible endpoints.

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

ℹ️ The environment variable `KAFNUS_NGSI_LOG_LEVEL` controls the verbosity, set the variable in [`/docker/docker-compose.faust.yml`](/docker/docker-compose.faust.yml).  
Defaults to `INFO` if not set.

Example log output:

```
time=2025-09-03T11:38:21.432Z | lvl=INFO | corr=n/a | trans=n/a | op=n/a | ver=0.0.1 | ob=ES | comp=Kafnus | msg=[historic] Sent to topic 'test' (table: 'limit_sensor'): Sensor:LimitTest:12
```

---

## 📥 Topics Consumed

- `raw_historic`
- `raw_lastdata`
- `raw_mutable`
- `raw_errors`
- `raw_mongo`

These are populated with NGSIv2 notifications from CB (or simulated with mosquitto or via a producer script).

---

## 📤 Topics Produced

- `<fiware_service>` → processed historic
- `<fiware_service>_lastdata` → processed lastdata
- `<fiware_service>_mutable` → processed mutable
- `<db_name>_error_log`  → DLQ-parsed errors
- Output topic for Mongo.

Topic names are dynamic, based on Kafka record headers and entity metadata.

---

## 🔄 Processing Flow

The core function is `handleEntityCb` in `lib/utils/handleEntityCb.js`:

1. Parse the input notification.
2. Add `recvtime`.
3. Convert `geo:*` attributes to WKB.
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

## 🧬 Field Type Inference

The function `inferFieldType` (see `lib/utils/ngsiUtils.js`) is responsible for converting NGSIv2 attributes (including their optional `attrType`) into Kafka Connect-compatible field types and processed values.

This function returns a tuple:

```js
function inferFieldType(name, value, attrType = null)
```

### 🔍 Behavior by NGSI `attrType`:

| NGSI Type         | Kafka Connect Type                   | Notes                                                                 |
|-------------------|---------------------------------------|-----------------------------------------------------------------------|
| `geo:*`           | `"geometry"`                         | Processed as PostGIS-compatible WKB.                                  |
| `DateTime`        | Kafka `Timestamp` schema (`int64`)   | Converted to epoch millis unless it's a special field (see below).    |
| `Float`           | `"float"`                            | Parsed as 32-bit float.                                               |
| `Number`          | `"int32"`, `"int64"`, or `"double"`  | Chooses the narrowest numeric type based on value range.              |
| `Boolean`         | `"boolean"`                          |                                                                       |
| `Text`, Unknown   | `"string"`                           | Default type when `attrType` is missing or unrecognized.             |
| `StructuredValue` | `"string"` (JSON)                    | Serialized to string for simplicity.                                  |

### ⚠️ Fallbacks


If `attrType` is missing, the type is inferred using JavaScript-native heuristics:

- Timestamps are recognized by pattern.
- Integers are scaled to fit the smallest Connect type.
- Objects/arrays are serialized to JSON strings.
- Values exceeding the `BIGINT` range fallback to string and are logged.

### ⚠️ Known Limitations

- Attributes with more than **9 decimal places** may lose precision if received as **strings via Context Broker**.
- Extremely large numbers (e.g., above `9223372036854775807`) are **not representable** as integers and are **downgraded to strings**.
- Errors during type inference (e.g., **invalid dates** or **malformed JSON**) are **logged and gracefully handled**.

---

## 🕒 DateTime Handling

Special treatment is applied to datetime fields to ensure compatibility and clarity across the entire data pipeline.

### ✅ `timeinstant` and `recvtime`

The fields `timeinstant` and `recvtime` are **always sent as ISO 8601 strings**.

- This keeps logs, metrics, and downstream queries human-readable.
- Transformation into proper timestamp columns is handled by the Kafka Connect JDBC Sink.

This decision simplifies validation, debugging, and filtering across tools like PostGIS and Prometheus.

Example:

```json
"timeinstant": "2025-07-31T10:12:00Z"
```

### 🧪 Other `DateTime` fields

For all other datetime attributes, values are converted to **epoch milliseconds** and wrapped in a Kafka Connect timestamp schema:

```python
epoch_ms = to_epoch_millis(value)
return {
    "type": "int64",
    "name": "org.apache.kafka.connect.data.Timestamp"
}, epoch_ms
```

This allows the timestamp to be interpreted natively by sinks like JDBC without requiring connector configuration.

The datetime parsing logic can be found in `lib/utils/ngsiUtils.js`.

---

## 🌍 Geometry Transformation

Geo attributes like `geo:point`, `geo:polygon`, and `geo:json` are converted to **WKB** for PostGIS. The logic uses Shapely, GeoJSON and WKT/WKB translation. This has been implemented thanks to this [PR](https://github.com/confluentinc/kafka-connect-jdbc/pull/1048).

Example:

```python
def to_wkb_struct_from_wkt(wkt_str, field_name, srid=4326):
    """
    Converts a WKT geometry string to a Debezium-compatible WKB struct with schema and base64-encoded payload.
    Used for sending geo attributes in Kafnus Connect format.
    """
    ...

def to_wkt_geometry(attr_type, attr_value):
    """
    Converts NGSI geo attributes (geo:point, geo:polygon, geo:json) to WKT string.
    Supports extension for additional geo types if needed.
    """
    ...
```

The resulting field is base64-encoded and embedded in the Kafnus Connect payload.

---

## 🗝️ Kafka Message Key

Each record includes a structured key, depending on the flow:

```python
def build_kafka_key(entity: dict, key_fields: list, include_timeinstant=False):
    """
    Builds the Kafka message key with schema based on key_fields and optionally timeinstant.
    This key is used for Kafnus Connect upsert mode or primary key definition.
    """
    ...
```

Useful for upsert operations in JDBC sinks (`lastdata`, `mutable`).

---

## 🧠 Flows and Behaviors

### `raw_historic`

- All notifications are sent downstream regardless of timestamp.
- Output topic: `<service>`

### `raw_lastdata`

- Maintains a Faust Table `last_seen_timestamps` to filter old records.
- Sends only newer TimeInstant values.
- Output topic: `<service>_lastdata`

### `raw_mutable`

- Allows overwriting/updating mutable data.
- Still under active development.
- Output topic: `<service>_mutable`

---

## 🚨 DLQ Handling (`raw_errors`)

Kafnus NGSI parses Kafnus Connect DLQ messages and reconstructs error logs:

```python
# Errors Agent
@app.agent(raw_errors_topic)
async def process_errors(stream):
    """
    Processes Kafnus Connect error messages from the 'raw_errors' topic.
    Parses failed inserts or connector issues, extracts the relevant SQL error message and context,
    and emits a structured error log message to a per-tenant error topic (e.g., 'clientname_error_log').
    """
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

## 🧪 Testing

Use `tests_end2end/` and `kafnus-ngsi/tests/postgis/` to simulate notification input and verify Kafnus NGSI behavior.

Producer example:

```bash
python producer.py tests/postgis/003_geometries/parking_zone_notification.json
```

Expected Kafnus NGSI log output:

```bash
[INFO] ✅ [_lastdata] Sent to topic 'tests_lastdata': NPO-101
```

---

## 🧭 Navigation

- [⬅️ Previous: ](/doc/04_docker.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Kafnus-Connect](/doc/06_kafnus_connect.md)