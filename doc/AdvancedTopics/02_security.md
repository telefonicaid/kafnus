# 🔒 Kafka Security in Kafnus

Kafnus supports optional **authentication** and **authorization** features for secure communication with Kafka. Both **Kafnus NGSI** (stream processor) and **Kafnus Connect** (persistence layer) can be configured to use **SASL** mechanisms and enforce **ACLs** to control access to topics and consumer groups.

This section provides a complete operational reference for enabling and managing security in a Kafnus deployment.

---

## 1️⃣ Kafnus NGSI – Kafka Authentication

`Kafnus NGSI` is a Node.js service built on [`@confluentinc/kafka-javascript`](https://www.npmjs.com/package/@confluentinc/kafka-js), supporting SASL authentication out of the box. No code changes are required.

### 🔧 Environment Variables

| Variable                        | Description                                              |
| ------------------------------- | -------------------------------------------------------- |
| `KAFNUS_NGSI_SECURITY_PROTOCOL` | Kafka security protocol (`SASL_PLAINTEXT` or `SASL_SSL`) |
| `KAFNUS_NGSI_SASL_MECHANISMS`   | SASL mechanism (`PLAIN` or `SCRAM-SHA-256/512`)          |
| `KAFNUS_NGSI_SASL_USERNAME`     | Kafka username for NGSI client                           |
| `KAFNUS_NGSI_SASL_PASSWORD`     | Kafka password for NGSI client                           |

> **Recommendation:** Use **SASL/PLAIN** for initial testing, and migrate to **SCRAM** for production environments.

### 🔑 Operational Notes

* NGSI will authenticate automatically using these variables.
* Can produce and consume from authorized topics.
* Supports multi-tenant deployments when combined with prefixed topics and ACLs.

---

## 2️⃣ Kafnus Connect – Kafka Authentication

`Kafnus Connect` is based on Kafka Connect. Enabling SASL required minor modifications to the `docker-entrypoint.sh` script to configure **all internal clients** (Worker, Producer, Consumer).

### 🔧 Required Broker Settings

Kafka brokers must be configured for SASL authentication:

```yaml
KAFKA_SASL_ENABLED_MECHANISMS: PLAIN
KAFKA_SASL_MECHANISM_INTER_BROKER_PROTOCOL: PLAIN
KAFKA_SASL_MECHANISM_CONTROLLER_PROTOCOL: PLAIN
KAFKA_OPTS: -Djava.security.auth.login.config=/opt/kafka/config/kafka_server_jaas.conf
KAFKA_AUTO_CREATE_TOPICS_ENABLE: true
KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
```

Example `kafka_server_jaas.conf`:

```properties
KafkaServer {
  org.apache.kafka.common.security.plain.PlainLoginModule required
  username="admin"
  password="admin-secret"
  user_admin="admin-secret"
  user_ngsi-user="ngsi-pass"
  user_connect-user="connect-pass";
};
```

---

### 🔧 Connect Environment Variables

| Variable                             | Description                           |
| ------------------------------------ | ------------------------------------- |
| `CONNECT_SECURITY_PROTOCOL`          | SASL protocol for Connect worker      |
| `CONNECT_SASL_MECHANISM`             | SASL mechanism for Connect worker     |
| `CONNECT_SASL_JAAS_CONFIG`           | JAAS configuration for Connect worker |
| `CONNECT_PRODUCER_SECURITY_PROTOCOL` | SASL protocol for internal producer   |
| `CONNECT_PRODUCER_SASL_MECHANISM`    | SASL mechanism for internal producer  |
| `CONNECT_PRODUCER_SASL_JAAS_CONFIG`  | JAAS config for internal producer     |
| `CONNECT_CONSUMER_SECURITY_PROTOCOL` | SASL protocol for internal consumer   |
| `CONNECT_CONSUMER_SASL_MECHANISM`    | SASL mechanism for internal consumer  |
| `CONNECT_CONSUMER_SASL_JAAS_CONFIG`  | JAAS config for internal consumer     |

> **Important:** All three clients must be configured; omitting any will result in SASL handshake failures.

---

### 🔧 Entrypoint Modification

```bash
# Security (optional)
if [ -n "${CONNECT_SECURITY_PROTOCOL}" ]; then
cat >> "${CONFIG_FILE}" <<EOF

security.protocol=${CONNECT_SECURITY_PROTOCOL}
sasl.mechanism=${CONNECT_SASL_MECHANISM}
sasl.jaas.config=${CONNECT_SASL_JAAS_CONFIG}

producer.security.protocol=${CONNECT_PRODUCER_SECURITY_PROTOCOL}
producer.sasl.mechanism=${CONNECT_PRODUCER_SASL_MECHANISM}
producer.sasl.jaas.config=${CONNECT_PRODUCER_SASL_JAAS_CONFIG}

consumer.security.protocol=${CONNECT_CONSUMER_SECURITY_PROTOCOL}
consumer.sasl.mechanism=${CONNECT_CONSUMER_SASL_MECHANISM}
consumer.sasl.jaas.config=${CONNECT_CONSUMER_SASL_JAAS_CONFIG}
EOF
fi
```

---

## 3️⃣ Kafka Authorization – ACLs

Authentication alone does **not** restrict access. Kafka ACLs define **which users can read, write, create, or manage topics and consumer groups**.

### 🔧 Broker Configuration

```yaml
KAFKA_AUTHORIZER_CLASS_NAME: org.apache.kafka.metadata.authorizer.StandardAuthorizer
KAFKA_ALLOW_EVERYONE_IF_NO_ACL_FOUND: false
KAFKA_SUPER_USERS: User:admin
```

* `ALLOW_EVERYONE_IF_NO_ACL_FOUND=false` enforces a **deny-by-default** policy.
* `SUPER_USERS` can bypass ACLs for administrative operations.

---

### 🔸 Typical ACL Setup

In a secure Kafnus deployment, ACLs should be configured to match the **data flow between components**:

#### Context Broker (CB)

* **Write** permission on all raw topics, typically prefixed as `smc_raw_...`.

  > This allows the Context Broker to push NGSI notifications into Kafka.

#### Kafnus NGSI (`ngsi-user`)

* **Read** from raw topics: `smc_raw_...`.
* **Write** and **Create** (if they have not been provisioned) on processed topics: `smc_..._processed`.

  > NGSI transforms raw notifications and produces processed events for downstream consumption.
* **Read** on consumer groups used for NGSI consumption.

#### Kafnus Connect (`connect-user`)

* **Read** from processed topics: `smc_..._processed`.
* **Write** on error topics: typically `smc_raw_errors` (for invalid or rejected messages).
* **Create** new topics as needed for Connect workflows (if they have not been provisioned).
* **Full access (`All`)** on internal Connect topics:
  * `connect-configs`
  * `connect-offsets`
  * `connect-status`
* **Read** on all consumer groups used by Connect.

> ⚠️ **Important Notes:**
>
> 1. Topic **creation requires explicit `Create` permission**; `Write` alone is not enough.
> 2. Prefixed topics allow multi-tenant isolation (e.g., `smc_` for city X, `smc_y_` for city Y).
> 3. Error handling topics (`*_errors`) are typically write-only for Connect and NGSI, read-only for monitoring or alerting.

---

### 🔸 Example: Adding ACLs

```bash
/opt/kafka/bin/kafka-acls.sh \
  --bootstrap-server kafka:29092 \
  --command-config /tmp/admin.properties \
  --add --allow-principal User:ngsi-user \
  --operation Read --topic smc_ --resource-pattern-type prefixed
```

Repeat for all required operations (`Write`, `Create`) and users.

---

## 4️⃣ Operational Recommendations

1. **Use separate users per service** (NGSI, Connect Worker, Connect Producer/Consumer) for minimal privileges.
2. Start with **SASL/PLAIN** for validation, migrate to **SCRAM** in production.
3. Always define ACLs when `ALLOW_EVERYONE_IF_NO_ACL_FOUND=false`.
4. Test connections and topic access after enabling SASL and ACLs.

---

## 🧭 Navigation

- [⬅️ Back: Advanced Topics](/doc/03_advanced_topics.md)