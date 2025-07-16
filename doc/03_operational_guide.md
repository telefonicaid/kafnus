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
kafnus-ngsi     ← Kafnus NGSI
orion           ← Context Broker
mongo           ← MongoDB
mosquitto       ← MQTT broker
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
  kafka-console-consumer \
    --bootstrap-server kafka:9092 \
    --topic raw_errors \
    --from-beginning \
    --max-messages 10
```

---

## 🔄 4. Connector Management

### 4.1 Register a Connector

From project root `sinks/`:

```bash
cd sinks/
curl -X POST -H "Content-Type: application/json" \
     --data @pg-sink-historic.json \
     http://localhost:8083/connectors
```

Repeat for `pg-sink-lastdata.json`, `pg-sink-mutable.json`, `pg-sink-errors.json`, `mqtt-source.json`.

### 4.2 Update Connector Config

Use HTTP PUT to update a running connector:

```bash
curl -X PUT -H "Content-Type: application/json" \
     --data @my-updated-config.json \
     http://localhost:8083/connectors/<name>/config
```

### 4.3 Delete a Connector

```bash
curl -X DELETE http://localhost:8083/connectors/<name>
```

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
  kafka-console-consumer \
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
  Check plugin path and JARs under `kafnus-connect/plugins/`.  
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

## 💾 7. Backup & Cleanup

Still in progress...

---

## 🧭 Navigation

- [⬅️ Previous: Architecture](./02_architecture.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Docker Details](./04_docker.md)

