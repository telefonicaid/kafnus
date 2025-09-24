# 🐳 Docker Setup

This document describes the Docker-based environment used in Kafnus, including the `docker-compose` files, build configuration for custom images, and helper scripts.

---

## 📁 File Structure

Most of Docker-related files are located in the `docker/` directory:

```plaintext
docker/
├── docker-compose.kafka.yml
├── docker-compose.ngsi.yml
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
- Orion + Mongo

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
- **Kafnus NGSI** is built using `kafnus-ngsi/Dockerfile`, which includes the Node.js stream processing app and all dependencies.

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

### `docker-compose.ngsi.yml`

Defines:

- `create-topics`: Creates all Kafka topics needed by Kafnus NGSI and Connect
- `kafnus-ngsi`: Builds and runs the Faust service

> **Note:** The `create-topics` service is no longer required and its lines are commented out in the Docker file.  
> If needed, this service could be repurposed to define the number of partitions for the input Kafka topics.

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

Defines the PostGIS database container:

- **Image:** Defined via the `KAFNUS_POSTGIS_IMAGE` environment variable.  
  By default, it uses the public image `postgis/postgis:15-3.3`, but internal environments may override this with `telefonicaiot/iotp-postgis`.

- **Volume:** Mounts `${KAFNUS_DBPATH_POSTGIS}` as the data directory.  
  **IMPORTANT:** This directory must exist and be owned by UID 999 and GID 999 (commonly used by PostGIS), or the container will fail to start.  
  Example:
  ```bash
  sudo chown -R 999:999 ${KAFNUS_DBPATH_POSTGIS}
  ```

- **Ports:** Exposes port `5432` for database access.

You can activate this container by uncommenting the relevant line in `docker-up.sh`.

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

The plugin directory (`/usr/local/share/kafnus-connect/plugins/`) inside the kafnus-connect image contains:

- `header-router` (custom SMT)
- `kafka-connect-jdbc` (custom connector with geometry support)
- `mongodb` connector
- `http` HTTP sink connector for forwarding Kafka data to external HTTP endpoints

---

## 🧪 Notes for Testing

The test suite can also dynamically start these containers via **Testcontainers** when running end-to-end tests. See [`08_testing.md`](doc/08_testing.md).

---

## 🧭 Navigation

- [⬅️ Previous: Operational-Guide](/doc/03_operational_guide.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Kafnus NGSI](/doc/05_kafnus_ngsi.md)