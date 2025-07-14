# 🧪 End-to-End Testing

This document explains how functional end-to-end tests are designed and executed in Kafnus using **Pytest** and **Testcontainers**.

---

## 🎯 Goal

Validate the full data processing pipeline, from **Context Broker notification** ingestion to **PostGIS persistence**, by:

- Automatically deploying services (Orion, Kafka, Kafka-Connect, Faust, PostGIS).
- Sending notifications as test input.
- Verifying final DB state against expected outputs.

---

## 🗂️ Directory Structure

Tests are located in:

- `tests_end2end/functional/`
  - `cases/`: Each test scenario has its own directory
  - `test_pipeline.py`:
  - `common_test.py`: Core functionalities (raise containers, subs to CB...)
  - `config.py`: database configuration, kafka-connect endpoint...
  - `utils/`: Scenario loader, DB validator, SQL runner, Kafka loader

```plaintext
tests_end2end/functional/
├── cases/
│   ├── 000A_simple/
│   │   ├── input.json
│   │   ├── expected_pg.json
│   │   └── setup.sql
│   ├── ...
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

---

## 🏗️ How It Works

1. The test runner discovers directorys under `cases/`.
2. Each case is parametrized into a Pytest test.
3. When launched:
   - A full test environment is deployed using **Testcontainers**
   - Optional `setup.sql` is applied to create schemas/tables
   - `input.json` is parsed to send CB subscriptions and entity updates
   - The resulting DB state is validated against `expected_pg.json`

---

## ⚙️ Services Launched

All necessary services are deployed dynamically via Docker using the `docker-compose.*.yml` files:

- Orion Context Broker
- Kafka
- Kafka Connect
- Faust
- PostGIS (optional, see below)

You don’t need to manually start any service.

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

---

## ▶️ Running the Tests

To run **all scenarios** with a container-managed PostGIS:

```bash
pytest -s test_pipeline.py
```

To run specific scenarios with an **already-running PostGIS**:

```bash
pytest -s test_pipeline.py -k "000A or 000B"
```

You can filter scenarios using `-k` and their directory names or tags.


> ⚠️ Remember that a warning will be displayed if the images have not been built.

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
2025-07-14 14:10:37,210 | DEBUG | 📦 Rows found in test.simple_sensor: 1  
2025-07-14 14:10:37,743 | DEBUG | ✅ Validation successful: all expected data found in test.simple_sensor  
2025-07-14 14:10:37,744 | INFO  | ✅ Scenario '000A_simple' passed successfully.  
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
        "mqttCustom": {
          "topic": "kafnus/test/simple/raw_historic"
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

### `expected_pg.json`
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
```

---

## 📌 Notes

- You can inspect Kafka and DB manually during pause (3600s sleep).
- Logs show useful debug output at each step.
- TestContainers ensures full isolation and cleanup.

## Navegación

- [⬅️ Previous: Monitoring](/doc/07_monitoring.md)
- [🏠 Main index](../README.md#documentation)
