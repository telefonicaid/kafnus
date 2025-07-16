# 🐳 Docker Setup

This document describes the Docker-based environment used in Kafnus, including the `docker-compose` files, build configuration for custom images, and helper scripts.

---

## 📁 File Structure

Most of Docker-related files are located in the `docker/` directory:

```plaintext
docker/
├── docker-compose.kafka.yml
├── docker-compose.faust.yml
├── docker-compose.orion.yml
├── docker-compose.postgis.yml     # (optional, disabled by default)
├── docker-compose.monitoring.yml  # (optional, disabled by default)
├── docker-up.sh
└── docker-down.sh
```

Custom Dockerfiles are located in their respective component directories:

```plaintext
kafnus-connect/
└── Dockerfile

kafnus-ngsi/
└── Dockerfile
```

---

## ▶️ Starting and Stopping Services

### `docker-up.sh`

Starts the default stack, including:

- Kafka + Kafnus Connect
- Kafnus NGSI
- Orion + Mongo + Mosquitto

PostGIS and Monitoring are commented out by default.

```bash
./docker-up.sh
```

> You can pass arguments like `-d` to run in detached mode.


### `docker-down.sh`

Stops the same services and removes volumes & orphan containers:

```bash
./docker-down.sh
```

---

## 🧱 Compose Files Summary

The Docker Compose setup relies on two custom images:

- **Kafnus Connect** is built using `kafnus-connect/Dockerfile`, which includes all required connectors and plugins during the image build process.
- **Kafnus NGSI** is built using `kafnus-ngsi/Dockerfile`, which includes the stream processing app and all dependencies.

Both images are automatically built via `docker-up.sh`, so you don't need to build them manually unless debugging or developing.


### `docker-compose.kafka.yml`

Defines:

- Kafka broker (port 9092, 29092)
- Kafnus Connect image with plugins:
  - Builds and runs custom image
  - Custom plugins in `/usr/local/share/kafnus-connect/plugins`
  - Monitoring enabled via JMX Exporter
- Connect waits for Kafka to be healthy before starting

Topics are auto-created (`KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`)

Kafnus Connect image is built from the [`Dockerfile`](../kafnus-connect/Dockerfile).

Exposes:
- Port `8083`: Kafnus Connect API
- Port `9100`: Prometheus metrics

To build from `/kafnus-connect` directory you can use:

```bash
docker build --no-cache -t kafnus-connect .
```

---

### `docker-compose.faust.yml`

Defines:

- `create-topics`: Creates all Kafka topics needed by Kafnus NGSI and Connect
- `kafnus-ngsi`: Builds and runs the Faust service

Kafnus NGSI image is built from the [`Dockerfile`](../kafnus-ngsi/Dockerfile).

Exposes:
- Port `8000`: Prometheus metrics
- Port `6066`: Optional Faust web interface (disabled by default)

To build from `/kafnus-ngsi` directory you can use:

```bash
docker build --no-cache -t kafnus-ngsi .
```

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
- Mounts volume: `${DBPATH_POSTGIS}` (bind mount must be defined in your shell). **IMPORTANT**: that directory has to have the right owner/permissions or the PostGIS container will refuse to start (typically `sudo chown -R 999:999 ${DBPATH_POSTGIS}`, as 999 is the usual UID and GID for PostGIS user).
- Exposes port `5432`

You can activate this in `docker-up.sh` by uncommenting the corresponding line.

---

### `docker-compose.monitoring.yml` (optional)

Includes:

- Prometheus
- Grafana
- Kafka Exporter

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

## ⚙️ Plugins

Kafnus Connect plugins are automatically bundled during image build (inside [`kafnus-connect/Dockerfile`](/kafnus-connect/Dockerfile)).

The plugin directory (`kafnus-connect/plugins/`) contains:

- `kafnus-connect/plugins/`: contains:
  - `header-router` (custom SMT)
  - `kafka-connect-jdbc` (custom connector with geometry support)
  - `mongodb` connector
  - `mqtt-kafka-connect` temporal bridge between CB and Kafka

---

## 🧪 Notes for Testing

The test suite can also dynamically start these containers via **Testcontainers** when running end-to-end tests. See [`08_testing.md`](doc/08_testing.md).

---

## Navegación

- [⬅️ Previous: Operational-Guide](/doc/03_operational_guide.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Kafnus NGSI](/doc/05_kafnus_ngsi.md)