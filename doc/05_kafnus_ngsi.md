# ⚙️ Kafnus NGSI Stream Processor

This document explains the role of the Kafnus NGSI application in Kafnus: how it transforms NGSIv2 notifications from Kafka into structured messages ready to be persisted via Kafnus Connect.

---

## 🧠 Overview

Faust is a Python stream processing library, similar to Kafka Streams but async/await native. In this project, it's used to:

- Decode and process NGSIv2 notifications.
- Add metadata like `recvtime`.
- Transform geo attributes into PostGIS-compatible WKB.
- Build Kafnus Connect-compatible records with key/schema/payload.
- Set headers like `target_table` to control downstream routing via SMT.

---

## 🔧 Configuration

### Main entry point

- `stream_processor.py` launches the Faust worker
- App name: `ngsi-processor`
- Broker: `kafka://kafka:9092`
- Web port: disabled (metrics exposed via `prometheus_client`)

### Launch command (in Docker):

```bash
faust -A stream_processor worker -l info
```

### Build command:

From `/kafnus-ngsi` directory:

```bash
docker build --no-cache -t kafnus-ngsi .
```

### **Logging**

The Faust processor uses structured logging to track processing flow, entity transformations, and message routing.

**Supported log levels:**

- `DEBUG`: Detailed internals (entity parsing, Kafka key/schema generation).
- `INFO`: Normal operation (successful sends to topics, startup lifecycle).
- `WARN`: Recoverable issues (e.g., invalid geo formats).
- `ERROR`: Parsing failures or bad input payloads.

ℹ️ The environment variable `KAFNUS_NGSI_LOG_LEVEL` controls the verbosity, set the variable in [`/docker/docker-compose.faust.yml`](/docker/docker-compose.faust.yml).  
Defaults to `INFO` if not set.

Example log output:

```
time=2025-07-15 10:04:31,786 | lvl=INFO | comp=KAFNUS-NGSI | op=app.agents.process:entity_handler.py[219]:handle_entity_cb | msg=✅ [mutable] Sent to topic 'test_mutable' (table: 'lighting_streetlight_mutable'): ENT-LUM-001
```

---

## 📥 Topics Consumed

- `raw_historic`
- `raw_lastdata`
- `raw_mutable`
- `raw_errors`
- `raw_mongo`

These are populated with NGSIv2 notifications from CB (or simulated with mosquitto or via `producer.py`).

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

The core function is `handle_entity()`:

1. Parse the input notification.
2. Add `recvtime`.
3. Convert `geo:*` attributes to WKB.
4. Build Kafnus Connect schema and payload.
5. Send to output topic.
6. Set header: `target_table = table_name`.

```python
async def handle_entity_cb(app, raw_value, headers=None, datamodel="dm-by-entity-type-database", suffix="", include_timeinstant=True, key_fields=None):
    """
    Consumes NGSI notifications coming via FIWARE Context Broker, processes and transforms them into Kafnus Connect format.
    Assumes raw_value is a JSON string with a payload field containing another JSON string with 'data' array.
    """
    ...
```

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

## Navegación

- [⬅️ Previous: ](/doc/04_docker.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Kafnus-Connect](/doc/06_kafnus_connect.md)