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

Custom Dockerfiles are located in their respective component repositories:

```plaintext
kafnus-ngsi/
└── Dockerfile  # builds Kafnus NGSI (Node.js stream processor)
```

Kafnus Connect (persistence layer) is maintained in a separate repository: [kafnus-connect](https://github.com/telefonicaid/kafnus-connect)

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

- **Kafnus Connect** → built from [kafnus-connect](https://github.com/telefonicaid/kafnus-connect), based on Kafka 4.1.0 + OpenJDK 17.  
  Includes all plugins: JDBC (PostGIS), MongoDB, HTTP, and custom SMTs.  
- **Kafnus NGSI** → built from this repository (`kafnus-ngsi/Dockerfile`), containing the Node.js-based stream processing logic.

Both images are downloaded automatically by `docker-up.sh`, so manual builds are rarely needed.

---

### `docker-compose.kafka.yml`

Defines:

- Kafka broker (port 9092, 29092)
- Kafnus Connect image with plugins:

  - Builds and runs custom image
  - Custom plugins in `${CONNECT_PLUGIN_PATH}` (default `/usr/local/share/kafnus-connect/plugins`)
  - Monitoring enabled via JMX Exporter (path `/home/appuser/jmx_exporter`)
- Connect waits for Kafka to be healthy before starting
- For tests, environment variables for sink connectors are defined (`KAFNUS_TESTS_PG_HOST`, `KAFNUS_TESTS_PG_PORT`...)

Topics are auto-created (`KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`)

> To build the Kafnus Connect image manually, follow the guide in the [kafnus-connect repository](https://github.com/telefonicaid/kafnus-connect).

---

### `docker-compose.ngsi.yml`

Defines:

- `create-topics`: Unused. Creates all source Kafka topics needed by Kafnus NGSI
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

Kafnus Connect automatically bundles required connectors and SMTs at image build time (see [kafnus-connect/Dockerfile](https://github.com/telefonicaid/kafnus-connect)).

Plugin directory (`${CONNECT_PLUGIN_PATH}`) includes:

- `header-router` → custom SMT for routing based on message headers  
- `kafka-connect-jdbc` → custom JDBC connector (PostGIS support)  
- `mongodb` → MongoDB sink connector  
- `http` → HTTP sink connector for pushing data to external APIs  

---

## 🧪 Notes for Testing

End-to-end tests use **Testcontainers** to dynamically spin up Kafka, Kafnus NGSI, and Kafnus Connect environments.

Connector definitions used in tests are stored under:

```plaintext
tests_end2end/sinks/
```

Refer to the [08_testing.md](./08_testing.md) guide for full details.

---

## 🧭 Navigation

- [⬅️ Previous: Operational Guide](/doc/03_operational_guide.md)
- [🏠 Main index](../README.md#documentation)
- [➡️ Next: Kafnus NGSI](/doc/05_kafnus_ngsi.md)