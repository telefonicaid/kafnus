# 🧪 End-to-End Testing

This document explains how functional end-to-end tests are designed and executed in Kafnus using **Pytest** and **Testcontainers**.

---

## 🎯 Goal

Validate the full data processing pipeline, from **Context Broker notification** ingestion to **PostGIS persistence**, by:

- Automatically deploying services (Orion, Kafka, Kafnus-Connect, Kafnus-NGSI, PostGIS).
- Sending notifications as test input.
- Verifying final DB state against expected outputs.

---

## 🗂️ Directory Structure

Tests are located in:

- `tests_end2end/functional/`
  - `cases/`: Each test scenario has its own directory
  - `test_pipeline.py`:
  - `common_test.py`: Core functionalities (raise containers, subs to CB...)
  - `config.py`: database configuration, kafnus-connect endpoint...
  - `utils/`: Scenario loader, DB validator, SQL runner, Kafka loader

```plaintext
tests_end2end/functional/
├── cases/
│   ├── http/
│   ├── mongo/
│   └── postgis/
│       ├── 000_basic/
│       │   ├── 001_simple/
│       │   │   ├── description.txt
│       │   │   ├── input.json
│       │   │   ├── expected_pg.json
│       │   │   └── setup.sql
│       │   └── ...
├── test_pipeline.py
├── common_test.py
├── config.py
├── conftest.py
└── utils/
```

---

## 🧪 Test Scenario Format

Each test case directory under `cases/` includes:

- `input.json`: CB subscriptions and update entities
- `expected_pg.json`: Expected DB rows after processing
- `setup.sql`: (optional) SQL schema/tables setup
- `description.txt`: (optional) Human-readable test description shown in logs

---

## 🏗️ How It Works

1. The test runner discovers directorys under `cases/`.
2. Each case is parametrized into a Pytest test.
3. When launched:
   - A full test environment is deployed using **Testcontainers**
   - Optional `description.txt` is displayed
   - Optional `setup.sql` is applied to create schemas/tables
   - `input.json` is parsed to send CB subscriptions and entity updates
   - The resulting DB state is validated against `expected_{sink}.json`

---

## ⚙️ Services Launched

All necessary services are deployed dynamically via Docker using the `docker-compose.*.yml` files:

- Orion Context Broker
- Kafka
- Kafnus Connect
- Kafnus NGSI
- PostGIS (optional, see below)
- Mongo

You don’t need to manually start any service.

### 💡 Environment Variables in Test Sinks

During end-to-end tests, **sink connectors** (PostGIS, MongoDB, HTTP) use environment variables to dynamically resolve their connection settings through the Kafka Connect `EnvVarConfigProvider`.

Example usage inside connector definitions:

```json
"connection.url": "jdbc:postgresql://${env:KAFNUS_TESTS_PG_HOST}:${env:KAFNUS_TESTS_PG_PORT}/${env:KAFNUS_TESTS_PG_DBNAME}",
"connection.uri": "mongodb://${env:MONGO_HOST}:${env:MONGO_PORT}"
```

These variables are defined in the `kafnus-connect` service within `docker-compose.kafka.yml`:

```yaml
KAFNUS_TESTS_PG_HOST: iot-postgis
KAFNUS_TESTS_PG_PORT: "5432"
KAFNUS_TESTS_PG_DBNAME: tests
KAFNUS_TESTS_PG_USER: postgres
KAFNUS_TESTS_PG_PASSWORD: postgres
MONGO_HOST: mongo
MONGO_PORT: "27017"
```

> ✅ This approach avoids hardcoded credentials, improves portability, and keeps test configurations cleaner and safer.

---

## ⚡ Dynamic PostGIS Handling

The test suite **always checks** whether the required PostGIS database exists, and **creates it if missing**, including:

- The database itself
- The PostGIS extension
- Necessary schema and error table

This behavior is **independent of whether you use a containerized or external PostGIS instance**.

To control whether the test environment should **launch a PostGIS container** or not, use the environment variable `KAFNUS_TESTS_USE_EXTERNAL_POSTGIS` in your `.env` file:

```env
KAFNUS_TESTS_USE_EXTERNAL_POSTGIS=false  # to run PostGIS container
# or
KAFNUS_TESTS_USE_EXTERNAL_POSTGIS=true   # to use an external PostGIS instance
```

> 📝 Note: `KAFNUS_DBPATH_POSTGIS` and `KAFNUS_POSTGIS_IMAGE` are included in the `.env.example` file.  
> You have to adjust the values in `.env` file, or default values will be used.
>
> 💡 If using the internal PostGIS container, you can override the image via the `KAFNUS_POSTGIS_IMAGE` environment variable (also defined in `.env.example`):
>
> ```env
> POSTGIS_IMAGE=postgis/postgis:15-3.3        # Default public image
> # or
> POSTGIS_IMAGE=telefonicaiot/iotp-postgis:12.14-3.3.2-2  # Internal Telefónica image
> ```
>

---

## ▶️ Running the Tests

To run **all scenarios**:

```bash
pytest -s test_pipeline.py
```

You can filter scenarios using `-k` and their directory names or tags. To run specific scenarios:

```bash
pytest -s test_pipeline.py -k "postgis"
pytest -s test_pipeline.py -k "000A or 000B"
```


> ⚠️ Remember that a warning could be displayed if the images have not been built.

## 🐞 Debugging & Logging

The test suite uses **structured logging** with the following severity levels:

- `DEBUG`: Detailed internal flow (DB polling, Kafka setup, validation attempts).
- `INFO`: General scenario progress and operational status.
- `WARN`: Unexpected but recoverable situations (e.g., connector not ready yet).
- `ERROR`: Failures that don’t stop the test runner.
- `FATAL`: Critical errors that require immediate termination.

> ℹ️ Note: Log level names in `.env` follow platform conventions (`WARN`, `FATAL`), but are internally mapped to standard Python logging levels.

To enable `DEBUG` logs, set this in your `.env` file:

```
KAFNUS_TESTS_LOG_LEVEL=DEBUG
```

Logs are printed to standard output in the following format:

```
time=2025-07-16 14:26:55,580 | lvl=DEBUG | comp=KAFNUS-TESTS | op=kafnus-tests:postgis_validator.py[50]:_query_table | msg=📦 Rows found in test.simple_sensor_mutable: 1
time=2025-07-16 14:26:55,581 | lvl=DEBUG | comp=KAFNUS-TESTS | op=kafnus-tests:postgis_validator.py[67]:validate | msg=✅ Validation successful: all expected data found in test.simple_sensor_mutable
time=2025-07-16 14:26:55,581 | lvl=DEBUG | comp=KAFNUS-TESTS | op=kafnus-tests:test_pipeline.py[115]:test_e2e_pipeline | msg=✅ Table test.simple_sensor_mutable validated successfully
time=2025-07-16 14:26:55,581 | lvl=INFO | comp=KAFNUS-TESTS | op=kafnus-tests:test_pipeline.py[118]:test_e2e_pipeline | msg=✅ Scenario 000A_simple passed successfully.
```

If no log level is defined, the default is `INFO`.

## ▶️ Optional Manual Inspection Pause

For manual inspection before test containers shut down, enable the `KAFNUS_TESTS_E2E_MANUAL_INSPECTION` flag in your `.env` file:

```env
KAFNUS_TESTS_E2E_MANUAL_INSPECTION=true
```

When enabled, tests will pause for up to 1 hour (or until you press `Ctrl + C`), allowing manual inspection of the running services.

---

## 🧬 Example Scenario Files

### 🛑 MongoValidator Test Constraint

> ⚠️ **Important:** The `MongoValidator` is hardcoded to connect **only** to the database `sth_test`.  
> Therefore, in Mongo-related end-to-end test scenarios, the `fiware-service` **must be set to `"test"`** to ensure documents are correctly published to the database that the validator inspects.

Example `input.json` for a Mongo test case:

```json
{
  "name": "mongo_test_case_basic",
  "fiware-service": "test", <-
  "fiware-servicepath": "/mongo",
  "subscriptions": {
    ...
  },
  "updateEntities": [
    ...
}
```

- All documents sent to the dynamic Kafka topic `test_mongo` are stored in `sth_test.<collection>`.  
- The collection name is derived from `fiware-servicepath` and encoded using `encodeMongo()`.  
- The validator ignores `recvTime` field during checks.


### `setup.sql`
```sql
CREATE SCHEMA IF NOT EXISTS test;

CREATE TABLE test.simple_sensor (
    recvtime TIMESTAMPTZ DEFAULT now(),
    entityid TEXT,
    temperature DOUBLE PRECISION,
    PRIMARY KEY (entityid)
);
```

### `input.json`
```json
{
  "fiware-service": "test",
  "fiware-servicepath": "/simple",
  "subscriptions": {
    "historic": {
      "notification": {
        "kafkaCustom": {
          "topic": "kafka://kafka:29092"
        },
        "attrs": ["TimeInstant", "temperature"]
      }
    }
  },
  "updateEntities": [
    {
      "id": "Sensor1",
      "type": "Sensor",
      "temperature": { "value": 25.0, "type": "Float" }
    }
  ]
}
```

### `expected_{sink}.json`
```json
[
  {
    "table": "test.simple_sensor",
    "rows": [
      { "entityid": "Sensor1", "temperature": 25.0 }
    ]
  }
]
```

---

## ✅ Validation Features

- Partial row validation (you only define key columns to check).
- Output asserts by table.
- DB setup is idempotent.

---

## 🧪 Test Lifecycle (simplified)

```python
@pytest.mark.parametrize(...)
def test_e2e_pipeline(scenario_name, input_json, expected_json, setup_sql, multiservice_stack):
    if setup_sql:
        execute_sql_file(setup_sql)

    service_operations.orion_set_up()  # send subscriptions + updates
    expected_data = load_scenario(expected_json, as_expected=True)
    
    validator = PostgisValidator(...)
    assert validator.validate(...) is True

    validator = MongoValidator()
    assert validator.validate(...) is True
```

---

## 🧪 Copilot Extended Test Coverage

The e2e test battery has been extended to cover additional real-world scenarios and edge cases:

### **New Test Categories**

#### 📦 Multi-Entity Processing
- `000_basic/003_multi_entity_batch`: Tests batch processing of multiple entity types (sensors + streetlights) in a single update request

#### 🔗 Complex Data Structures  
- `001_ngsi_types/005_complex_nested_data`: Validates handling of nested JSON objects, arrays, and structured values
- `001_ngsi_types/006_edge_case_data`: Tests edge cases including zero values, empty strings, large numbers, Unicode text, and special characters

#### ⚠️ Error Handling & Recovery
- `003_errors/002_invalid_data_recovery`: Validates system behavior when processing invalid data mixed with valid data

#### ⚡ Performance & Scalability
- `005_performance/001_large_payload`: Tests system performance with large payloads and bulk data processing

#### 📡 Subscription Patterns
- `006_subscriptions/001_pattern_variations`: Tests different subscription patterns, ID patterns, condition attributes, and notification configurations

### **Coverage Improvements**

The extended test suite now validates:
- **Multi-entity scenarios**: Batch processing of different entity types
- **Complex data handling**: Nested objects, arrays, and structured JSON payloads  
- **Edge case robustness**: Zero values, empty strings, Unicode, special characters
- **Error resilience**: Recovery from invalid data while maintaining system integrity
- **Performance characteristics**: Large payload handling and throughput
- **Subscription flexibility**: Various pattern matching and notification strategies

All new tests follow the established pattern with `description.txt`, `input.json`, `expected_pg.json`, and `setup.sql` files.

---

## 📌 Notes

- You can inspect Kafka and DB manually during pause (3600s sleep).
- Logs show useful debug output at each step.
- TestContainers ensures full isolation and cleanup.
- The test suite now includes **16 scenarios** covering core functionality, data types, error handling, performance, and subscription patterns.

## 🧭 Navigation

- [⬅️ Previous: Monitoring](/doc/07_monitoring.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Scaling](/doc/09_scaling.md)