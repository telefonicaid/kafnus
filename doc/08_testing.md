# 🧪**Testing**

Kafnus provides an automated test strategy combining **JavaScript unit tests** for `kafnus-ngsi` and **Python integration/end-to-end tests** for the full pipeline, from **Orion notifications** to **database persistence**, including **HTTP behavior**, **MongoDB**, **PostGIS**, and **resilience under database outages**.

Tests are organized into five main categories:

* **Unit tests (`kafnus-ngsi/tests/`)**
* **Functional tests (End-to-End scenarios)**
* **Admin Server tests**
* **Resilience tests (database outage recovery)**
* **Batching tests**

This document explains the structure, purpose, and execution of each category.

---

## 🗂️**Test Folder Structure**

```
kafnus-ngsi/
└── tests/                     # Jest unit tests for NGSI mapping and helpers

tests_end2end/
├── common/                     # Shared utilities used across all test groups
│   ├── common_test.py
│   ├── config.py
│   └── utils/
│       ├── http_validator.py
│       ├── kafnus_connect_loader.py
│       ├── mongo_validator.py
│       ├── postgis_validator.py
│       ├── setup_tests.sql
│       ├── sql_runner.py
│       └── wait_services.py
│
├── functional/                # End-to-end scenario-driven tests
│   ├── cases/
│   │   ├── http/             # HTTP-output scenarios
│   │   ├── mongo/            # MongoDB-output scenarios
│   │   └── postgis/          # PostGIS-output scenarios
│   ├── test_pipeline.py      # Scenario runner (functional E2E)
│   ├── test_admin_server.py  # Admin server /health, /connectors, etc.
│   └── utils/scenario_loader.py
│
├── batching/                  # JDBC batch processing and error handling tests
│   ├── test_jdbc_batch_backlog.py  # Validates batch processing of large message backlogs
│   ├── test_jdbc_batch_errors.py   # Validates batch processing with errors
│   ├── setup.sql
│   └── conftest.py
│
├── resilience/               # Failure & recovery tests
│   ├── test_db_outage_recover.py
│   └── utils/
│       ├── setup.sql
│       └── utils.py
│
└── sinks/                    # Test sink connector definitions
```

---

## 1. **Unit Tests (`kafnus-ngsi/tests/`)**

The `kafnus-ngsi` module includes a Jest-based unit test suite focused on **fast validation of transformation logic** without starting the full Docker stack.

These tests currently cover areas such as:

* NGSI attribute type inference
* Kafka payload/schema generation
* Kafka key generation
* FIWARE header extraction
* Geo conversion helpers
* Producer retry/error handling in `handleEntityCb`

### Why unit tests were added

The main integration suite is implemented in **Python/Pytest** and exercises the system through containers and external services, which is great for **functional validation** but slow for checking transformation logic in detail. The Jest suite covers that logic directly around the Node.js codebase.

### Coverage workflow

The repository's GitHub Actions workflow (`.github/workflows/ci.yml`) runs:

* Dockerfile linting
* JavaScript linting
* Jest unit tests with LCOV coverage export
* The functional end-to-end tests (`test_pipeline.py`), collecting `kafnus-ngsi` coverage from its container (see [End-to-end coverage](#end-to-end-coverage-of-kafnus-ngsi))
* Coveralls upload and SonarQube analysis with both LCOV reports

### Running unit tests locally

From the `kafnus-ngsi/` directory:

```bash
npm test
npm run test:coverage
```

---

## 2. **Functional Tests (End-to-End `test_pipeline.py`)**

The functional suite validates the full path of a real NGSI flow:

```
Orion → Kafka → Kafnus NGSI → Kafka → Kafnus Connect → PostGIS / MongoDB / HTTP
```

### 🧪 Test Scenario Format

Each scenario folder contains:

* `input.json` → subscriptions + updateEntities
* `expected_pg.json` / `expected_mongo.json` / `expected_http.json`
* `setup.sql` (optional)
* `description.txt` (optional)

---

### 🏗️ How It Works

1. The test runner discovers directorys under `cases/`.
2. Each case is parametrized into a Pytest test.
3. When launched:
   - A full test environment is deployed using **Testcontainers**
   - Optional `description.txt` is displayed
   - Optional `setup.sql` is applied to create schemas/tables
   - `input.json` is parsed to send CB subscriptions and entity updates
   - The resulting DB state is validated against `expected_{sink}.json`

### **Pipeline Execution Process**

`test_pipeline.py` automatically performs:

1. Execute optional SQL setup
2. Load scenario and send subscriptions + updates to Orion
3. Pre-create HTTP mocks when needed
4. Validate expected PostGIS / MongoDB / HTTP outputs
5. Tear down temporary services

This test suite ensures correctness of:

* NGSI → Kafka mapping
* Processing performed by Kafnus-NGSI
* Persistence using JDBC / MongoDB / HTTP sinks

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

### ⚙️ Services Launched

All necessary services are deployed dynamically via Docker using the `docker-compose.*.yml` files:

- Orion Context Broker
- Kafka
- Kafnus Connect
- Kafnus NGSI
- PostGIS (optional, see below)
- Mongo

You don’t need to manually start any service.

### ⚡ Dynamic PostGIS Handling

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

### ⏱️ Per-attribute TimeInstant splitting and ensuring

`kafnus-ngsi` ships with per-attribute `TimeInstant` splitting (`KAFNUS_NGSI_SPLIT_BY_TIMEINSTANT`) and the `timeinstant`
presence guarantee (`KAFNUS_NGSI_ENSURE_TIMEINSTANT`) both disabled by default — see [`05_kafnus_ngsi.md`](/doc/05_kafnus_ngsi.md)
for what each flag does and how they compose. The e2e stack itself always starts with every `KAFNUS_NGSI_*` flag at its real
default, matching real deployments.

The scenarios under `functional/cases/postgis/012_per_attr_timeinstant/` need one or both flags set to `true` to exercise the
behavior they describe. Each such scenario carries a `requires_env.json` (read by `scenario_loader.discover_scenarios()`)
naming the env vars and values it needs; that's resolved into the *full* set of flags `docker-compose.ngsi.yml` forwards to
the container (unlisted flags default to `false`, so a scenario without a `requires_env.json` is equivalent to one that
lists every flag as `false`). Before each scenario runs, the `ngsi_env` fixture
(`functional/conftest.py`) recreates the `kafnus-ngsi` container with exactly that resolved env, but only when it differs
from what's already running (`DockerCompose.ensure_service_env`, `common/common_test.py`) — most scenarios need nothing
here since they resolve to the same all-`false` defaults the container already starts with. Scenarios are collected sorted
by their resolved env first and name second, which clusters every "nothing special" scenario into one contiguous block, so
a full suite run pays for exactly one container recreate per *distinct* flag combination actually in use, not per scenario.

Since kafnus-ngsi reads its env once at process startup with no hot-reload, changing it requires a full
`docker compose up --force-recreate`, followed by re-running the same Kafka smoke-test readiness check
(`wait_for_kafnus_ngsi`) `multiservice_stack` already runs once at stack startup — a real but bounded cost (one recreate +
readiness wait per distinct combo, not per scenario).

A scenario whose `requires_env.json` names a var `docker-compose.ngsi.yml` doesn't forward to the container at all is still
skipped with a reason — there's nothing a container recreation can do about that; adding a new `KAFNUS_NGSI_*` flag to
`docker-compose.ngsi.yml`'s `environment:` block (see the existing entries there for the pattern) is what makes it usable
here.

---

### 🧬 Example Scenario Files

> ⚠️ **Important:** The `MongoValidator` is hardcoded to connect **only** to the database `bigdata_test`.  
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

- All documents sent to the dynamic Kafka topic `test_mongo` are stored in `bigdata_test.<collection>`.  
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

### 🧪 Copilot Extended Test Coverage

The e2e test battery has been extended to cover additional real-world scenarios and edge cases:

### **New Test Categories**

#### 📦 Multi-Entity Processing
- `000_basic/003_multi_entity_batch`: Tests batch processing of multiple entity types (sensors + streetlights) in a single update request

#### 🔗 Complex Data Structures  
- `001_ngsi_types/005_complex_nested_data`: Validates handling of nested JSON objects, arrays, and structured values
- `001_ngsi_types/006_edge_case_data`: Tests edge cases including zero values, empty strings, large numbers, Unicode text, and special characters

#### ⚠️ Error Handling & Recovery
- `003_errors/002_invalid_data_recovery`: Validates system behavior when processing invalid data mixed with valid data

#### 🌐 HTTP Retryable Business Errors
- Example scenario: creating an entity with a relation that does not exist yet (GraphQL response `200` with `errors`).
- Expected behavior in current pipeline:
  - The HTTP sink identifies it as an error condition for processing.
  - The event is persisted in the error log flow (for example in `test.sgtr_error_log` during tests).
- This scenario is useful to distinguish between:
  - `already exists` responses (currently accepted without DLQ/retry), and
  - relation/reference errors that must remain traceable in error logs.

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


## 3. **Admin Server Tests (`test_admin_server.py`)**

This test is **a separate test suite for the Admin Server**, which covers:

- `/logLevel`: GET and POST to check and change log levels.
- `/metrics`: GET to expose Prometheus metrics, including 406 behavior when `Accept` does not allow Prometheus text format.
- `/health`: GET to check operational status (`status: "UP"`) and pipeline summary (`totalEvents`, `successEvents`, `errorEvents`, `successRate`, `byFlow`).

> ⚡ This suite validates that the Admin Server is available and that health/metrics expose useful operational information for the Kafka processing pipeline.


---

## 4. **Resilience Tests (`test_db_outage_recover.py`)**

This is the newest test category and validates **Kafnus Connect’s behavior when Postgres goes DOWN and later comes BACK**.

It ensures:

* Failed JDBC connections are detected
* Tasks transition to `FAILED` when expected
* Auto-recovery after DB restart works
* No data loss occurs, even if messages arrive during the outage

---

### **Phase 1 — Initial write while DB is UP**

1. Execute `setup.sql` to prepare recovery tables.
2. Create subscriptions (`historic`, `mutable`, `lastdata`).
3. Send entity **E1**.
4. Verify all sinks write correctly into:

   * `test.recover_test`
   * `test.recover_test_lastdata`
   * `test.recover_test_mutable`

This establishes a correct baseline.

---

### **Phase 2 — Database outage without incoming data**

1. Stop Postgres.
2. Wait for the JDBC sink to detect the outage.
3. Start Postgres.
4. Wait until the connector returns to `RUNNING`.
5. Send entity **E2**.
6. Validate DB contains: **E1, E2**.

This validates recovery **without queued messages**.

---

### **Phase 3 — Database outage *with* incoming data**

1. Stop Postgres again.
2. Send entity **E3** while DB is DOWN.
3. Sink task fails (expected).
4. Start Postgres.
5. Connector auto-recovers.
6. Validate DB contains: **E1, E2, E3**.

This simulates real production outages with in-flight data.

---

## 5. **Batching Tests (`test_jdbc_batch_backlog.py` and `test_jdbc_batch_errors.py`)**

This test category validates **JDBC sink batch processing** and error handling under high-volume data scenarios.

### **Test Purpose**

- **Backlog Processing**: Validates that the JDBC sink correctly processes large backlogs of messages using batch mechanics when Kafnus services are momentarily stopped.
- **Error Handling During Batches**: Validates that JDBC failures are routed to the PostGIS error log while valid backlog records continue to persist.

### **Phase 1 — Backlog Accumulation (`test_jdbc_batch_backlog`)**

1. Stop `kafnus-ngsi` and `kafnus-connect` services.
2. Send a large batch of entities (~12,000 messages) to Orion Context Broker across multiple requests.
3. Create subscriptions for `historic`, `lastdata`, and `mutable` sinks.
4. Replay `E0` on `/batch` with a `TimeInstant` three days later and temperature `99999.0`.
5. Send a **sentinel entity** (ID: `__END__`) to mark the end of the batch.
6. Start `kafnus-ngsi` to process the accumulated Kafka messages.
7. Start `kafnus-connect` to write the backlog to PostGIS.
8. Verify the sentinel, expected row counts in the historic and `lastdata` tables for `/batch` and `/batch2`, representative entity IDs, and the latest `E0` values in `batch_test_lastdata`.

This ensures:
- Historic and `lastdata` sinks persist the expected backlog volume for both routes
- Boundary entity IDs are present in each historic and `lastdata` table
- The historic table retains both `E0` measurements, while `lastdata` keeps one row for `E0` with the replay's newer timestamp and temperature (`99999.0`)
- The sentinel confirms processing reached the end of the backlog

### **Phase 2 — Error Handling in Batches (`test_jdbc_batch_errors.py`)**

The file contains two end-to-end tests:

- `test_jdbc_batch_backlog` accumulates a valid historic backlog while `kafnus-ngsi` and `kafnus-connect` are stopped, then injects four records that should fail at JDBC:

  - **Unknown subservice**: `/errorFAIL` has no destination table.
  - **Duplicate primary key**: a seeded row in `duplicate_key_test` is inserted a second time with the same `(timeinstant, entityid)` key.
  - **Missing required destination column**: a required `missing_column` field is sent to `missing_column_test`, whose table does not define that column. JDBC Connect rejects the record while trying to evolve the table.
  - **Invalid data type**: `temperature` is sent as NGSI `Text` with value `not-a-number`, but `invalid_type_test.temperature` is `DOUBLE PRECISION`.
- `test_jdbc_batch_failure_shares_execute_batch` sets `batch.size=3` and sends a duplicate key between two valid inserts targeting `same_batch_test`.

The backlog test verifies that:

- The expected valid backlog rows are present in the historic and `lastdata` tables for `/batch` and `/batch2`.
- Each of its four injected failures appears in `test.test_error_log` with the expected error:
  - Unknown subservice: destination table `errorfail_test` is missing and auto-creation is disabled.
  - Duplicate key: unique constraint `duplicate_key_test_pkey` is violated.
  - Missing column: JDBC Connect cannot evolve `missing_column_test` to add the required field.
  - Invalid type: PostgreSQL rejects a character-varying `temperature` expression for the `DOUBLE PRECISION` column.
- The sentinel is persisted, confirming processing continued past the invalid records.

The shared-batch test verifies that the duplicate violates `same_batch_test_pkey`, both valid surrounding rows persist, and `same_batch_test` contains the seeded row plus those two valid rows.

These results describe the configured JDBC connector and test database: they do
not imply that every driver or every type of batch failure has identical
transaction behavior. The historic sink uses `errors.tolerance=all`, DLQ
routing, and `max.retries=0`; transient database connection setup is configured
separately through `connection.attempts` and `connection.backoff.ms`.

### **Test Configuration**

Both tests use:

- **Batch Size**: 12,000 messages (configurable via `BATCH_SIZE` constant)
- **Subscriptions**: Historic, lastdata, and mutable routes are configured; the tests assert historic and lastdata backlog tables plus the error log.
- **Database Tables**: `batch_test` / `batch_test_lastdata` and `batch2_test` / `batch2_test_lastdata` hold the two historic and lastdata backlogs; dedicated tables seed or trigger the error cases.

---

## Sinks
During end-to-end and recovery tests, **sink connectors** (PostGIS, MongoDB, HTTP) use environment variables to dynamically resolve their connection settings through the Kafka Connect `EnvVarConfigProvider`.

Example usage inside connector definitions:

```json
"connection.url": "jdbc:postgresql://${env:KAFNUS_TESTS_PG_HOST}:${env:KAFNUS_TESTS_PG_PORT}/${env:KAFNUS_TESTS_PG_DBNAME}",
"connection.uri": "mongodb://${env:KAFNUS_TESTS_MONGO_HOST}:${env:KAFNUS_TESTS_MONGO_PORT}"
```

These variables are defined in the `kafnus-connect` service within `docker-compose.kafka.yml`:

```yaml
KAFNUS_TESTS_PG_HOST: iot-postgis
KAFNUS_TESTS_PG_PORT: "5432"
KAFNUS_TESTS_PG_DBNAME: tests
KAFNUS_TESTS_PG_USER: postgres
KAFNUS_TESTS_PG_PASSWORD: postgres
KAFNUS_TESTS_MONGO_HOST: mongo
KAFNUS_TESTS_MONGO_PORT: "27017"
```

> ✅ This approach avoids hardcoded credentials, improves portability, and keeps test configurations cleaner and safer.


## ▶️ Running the Tests

To run the `kafnus-ngsi` unit tests:

```bash
cd kafnus-ngsi
npm test
npm run test:coverage
```

To run **all Python integration tests**:

```bash
pytest -s -v
```

Executes specific tests by providing the path to the test file.

```bash
pytest -s functional/test_pipeline.py
```

To run **batching tests**:

```bash
pytest -s batching/test_jdbc_batch_backlog.py      # Run large backlog processing test
pytest -s batching/test_jdbc_batch_errors.py       # Run error handling within batches test
pytest -s batching/                                 # Run all batching tests
```

You can filter scenarios using `-k` and their directory names or tags. To run specific scenarios:

```bash
pytest -s test_pipeline.py -k "postgis"
pytest -s test_pipeline.py -k "000A or 000B"
```

> ⚠️ Remember that a warning could be displayed if the images have not been built.

### End-to-end coverage of kafnus-ngsi

Setting `KAFNUS_TESTS_NGSI_COVERAGE=true` adds `docker/docker-compose.ngsi.coverage.yml` to the stack. The `kafnus-ngsi` container then runs with `NODE_V8_COVERAGE` and writes raw V8 coverage to `kafnus-ngsi/coverage-e2e/raw` every time its process exits cleanly, including container recreations between scenarios. The folder is emptied at the start of each run.

```bash
cd kafnus-ngsi && docker build -t kafnus-ngsi .   # the image must match the checked-out code
cd ../tests_end2end
KAFNUS_TESTS_NGSI_COVERAGE=true pytest -s functional/test_pipeline.py
cd ../kafnus-ngsi
npm run coverage:e2e                               # writes coverage-e2e/lcov.info
```

`npm run coverage:e2e` maps the container paths (`/opt/kafnus/kafnus-ngsi/...`) to the local checkout and generates the LCOV report with `c8`. SonarQube reads it together with the Jest report (`sonar.javascript.lcov.reportPaths`).

> ⚠️ V8 writes the raw files as `0600`, owned by the container's `node` user (uid 1000). If your host uid is different, run `sudo chmod -R a+rX kafnus-ngsi/coverage-e2e/raw` before `npm run coverage:e2e`.

### ▶️ Optional Manual Inspection Pause

For manual inspection before test containers shut down, enable the `KAFNUS_TESTS_E2E_MANUAL_INSPECTION` flag in your `.env` file:

```env
KAFNUS_TESTS_E2E_MANUAL_INSPECTION=true
```

When enabled, tests will pause for up to 1 hour (or until you press `Ctrl + C`), allowing manual inspection of the running services.


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

---

## 📌 Notes

- You can inspect Kafka and DB manually during pause (3600s sleep).
- Logs show useful debug output at each step.
- TestContainers ensures full isolation and cleanup.
- The test suite now includes **several scenarios** covering core functionality, data types, error handling, performance, and subscription patterns.

## 🧭 Navigation

- [⬅️ Previous: Monitoring](/doc/07_monitoring.md)
- [🏠 Main index](/README.md#documentation)
- [➡️ Next: Scaling](/doc/09_scaling.md)