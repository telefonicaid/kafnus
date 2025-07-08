# 🐳 Docker Setup

This document describes the Docker-based environment used in Kafnus, including the `docker-compose` files, build configuration for custom images, and helper scripts.

---

## 📁 File Structure

All Docker-related files are located in the `docker/` directory:

```plaintext
docker/
├── docker-compose.kafka.yml
├── docker-compose.faust.yml
├── docker-compose.orion.yml
├── docker-compose.postgis.yml     # (optional, disabled by default)
├── docker-compose.monitoring.yml  # (optional, disabled by default)
├── faust.Dockerfile
├── kafka-connect.Dockerfile       # (unused at this moment)
├── docker-up.sh
└── docker-down.sh
```

---

## ▶️ Starting and Stopping Services

### `docker-up.sh`

Starts the default stack, including:

- Kafka + Kafka Connect
- Faust
- Orion + Mongo + Mosquitto

PostGIS and Monitoring are commented out by default.

```bash
./docker-up.sh
```

### `docker-down.sh`

Stops the same services and removes volumes & orphan containers:

```bash
./docker-down.sh
```

> You can pass arguments like `-build` or `-d` to run in detached mode.

---

## 🧱 Compose Files Summary

### `docker-compose.kafka.yml`

Defines:

- Kafka broker (port 9092, 29092)
- Kafka Connect with:
  - Custom plugins in `/etc/kafka-connect/plugins`
  - Monitoring enabled via JMX Exporter
- Connect waits for Kafka to be healthy before starting

Topics are auto-created (`KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`)

---

### `docker-compose.faust.yml`

Defines:

- `create-topics`: Creates all Kafka topics needed by Faust and Connect
- `faust-stream`: Builds and runs the Faust service

Faust image is built from the [`faust.Dockerfile`](../docker/faust.Dockerfile).

Exposes:
- Port `8000`: Prometheus metrics
- Port `6066`: Optional Faust web interface (disabled by default)

To build from `/docker` directory you can use:

```bash
docker build --no-cache -f faust.Dockerfile -t faust-stream:latest ..
```

> Context for docker must be root directory

---

### `docker-compose.orion.yml`

Defines:

- **Orion Context Broker**
- **MongoDB**
- **Mosquitto**

Orion is configured to use Mosquitto as MQTT broker and MongoDB as DB backend. The broker reads config via `command: -dbURI`.

---

### `docker-compose.postgis.yml`

Defines the PostGIS database:

- Image: `telefonicaiot/iotp-postgis`
- Mounts volume: `${DBPATH_POSTGIS}` (bind mount must be defined in your shell). **IMPORTANT**: that directory has to have the right owner/permissions or the PostGIS container will refuse to start (typically `sudo chown -R 999:999 ${BDPATH_POSTGIS}`, as 999 is the usual UID and GID for PostGIS user).
- Exposes port `5432`

You can activate this in `docker-up.sh` by uncommenting the corresponding line.

---

### `docker-compose.monitoring.yml` (optional)

Includes:

- Prometheus
- Grafana
- Kafka Exporter
- Faust/Metrics Exporter

Disabled by default. You can enable it by uncommenting in `docker-up.sh`.

---

## 🔗 Shared Network

All services connect to the external Docker network:

```yaml
networks:
  kafka-postgis-net:
    external: true
```

Make sure this network exists (e.g. using `docker network ls`) otherwise create it using:

```bash
docker network create kafka-postgis-net
```

---

## ⚙️ Plugin Mounting

Kafka Connect mounts plugins from:

- `../plugins/`: contains:
  - `header-router.jar` (custom SMT)
  - `kafka-connect-jdbc`
  - `mongodb` connector

Plugins are referenced by `CONNECT_PLUGIN_PATH`.

---

## 🧪 Notes for Testing

The test suite can also dynamically start these containers via **Testcontainers** when running end-to-end tests. See `doc/08_testing.md`.

---

## Navegación

- [⬅️ Previous: Operational-Guide](/doc/03_operational_guide.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Faust](/doc/05_faust.md)