# 🧪 End-to-End Testing

This document explains how functional end-to-end tests are designed and executed in Kafnus using **Pytest** and **Testcontainers**.

---

## 🎯 Goal

Validate the full data processing pipeline, from **Context Broker notification** ingestion to **PostGIS persistence**, by:

- Automatically deploying services (Orion, Kafka, Kafka-Connect, Faust, PostGIS).
- Sending notifications as test input.
- Verifying final DB state against expected outputs.

---

## 🗂️ Folder Structure

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

To control whether the test environment should **launch a PostGIS container** or not, use the environment variable:

```bash
export USE_EXTERNAL_POSTGIS=true
```

- If `true`: assumes PostGIS is already running externally and skips starting the container.
- If `false` (default): launches PostGIS via Docker using Testcontainers.

---

## ▶️ Running the Tests

To run **all scenarios** with a container-managed PostGIS:

```bash
USE_EXTERNAL_POSTGIS=false pytest -s test_pipeline.py
```

To run specific scenarios with an **already-running PostGIS**:

```bash
USE_EXTERNAL_POSTGIS=true pytest -s test_pipeline.py -k "000A or 000B"
```

You can filter scenarios using `-k` and their directory names or tags.

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
