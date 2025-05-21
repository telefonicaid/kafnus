# How to Build the Custom Kafka Connect JDBC Sink with PostGIS Support

This guide explains how to compile the Kafka Connect JDBC Sink connector with geometry (PostGIS) support, based on the version `v10.7.0` of *Confluent JDBC Connector* and applying [PR #1048](https://github.com/confluentinc/kafka-connect-jdbc/pull/1048).

---

## 🛠️ Step 1: Clone the repo and apply the PR

### 🧬 1.1 Clone the official repo

```bash
git clone https://github.com/confluentinc/kafka-connect-jdbc.git
cd kafka-connect-jdbc
```

### 🏷️ 1.2 Checkout the stable version v10.7.0

```bash
git checkout v10.7.0
```

> ✅ Kafka Connect 7.9.0 uses `kafka-connect-jdbc` v10.7.x

### 🌿 1.3 Create a new branch

```bash
git checkout -b geometry-support-based-on-10.7.0
```

### 🍒 1.4 Cherry-pick PR #1048 commit

The relevant commit from [PR #1048](https://github.com/confluentinc/kafka-connect-jdbc/pull/1048) is:

```bash
git fetch origin pull/1048/head:pr-1048
git cherry-pick 0d024f500bee9dffbeb46887d29dd29fb0e5269d
```

> 💡 If there are conflicts, resolve them and then run `git cherry-pick --continue`.

---

## 🚧 Step 2: Fix HTTP repository errors

By default, the Confluent Maven repository uses `http`, which may cause dependency resolution failures. Here's how to fix it.

### 🔧 2.1 Patch `pom.xml` to use HTTPS

Edit the root file `kafka-connect-jdbc/pom.xml` and replace all occurrences of the Confluent repository with HTTPS:

Find:

```xml
<repository>
  <id>confluent</id>
  <url>http://packages.confluent.io/maven/</url>
</repository>
```

Replace with:

```xml
<repository>
  <id>confluent</id>
  <url>https://packages.confluent.io/maven/</url>
</repository>
```

Do this in any `<repositories>` block where it appears.

### 🔐 2.2 Override HTTP repo globally (recommended)

To fix inherited HTTP repositories (like `io.confluent:common:pom:6.0.0`), add a mirror override in your `~/.m2/settings.xml`:

Create or edit this file:

```xml
<settings xmlns="http://maven.apache.org/SETTINGS/1.0.0"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://maven.apache.org/SETTINGS/1.0.0 https://maven.apache.org/xsd/settings-1.0.0.xsd">
  <mirrors>
    <mirror>
      <id>confluent-https</id>
      <mirrorOf>confluent</mirrorOf>
      <url>https://packages.confluent.io/maven/</url>
    </mirror>
  </mirrors>
</settings>
```

---

## 🔧 Step 3: Build the connector JAR

Skip checkstyle and tests (they're not needed):

```bash
mvn clean package -DskipTests -Dcheckstyle.skip=true
```

If successful, you’ll get a `.jar` file like:

```
target/kafka-connect-jdbc-10.7.0.jar
```

---

## ⚠️ Step 4: Java version compatibility

If you see this error:
```
error: release version 8 not supported
```

It means your Java compiler doesn’t support the `--release 8` flag.

### ✅ Recommended: Use Java 8

Check current Java version:

```bash
javac -version
```

If it's not Java 8, switch to it. Example with SDKMAN:

```bash
sdk install java 8.0.392-tem
sdk use java 8.0.392-tem
```

Or in Ubuntu:

```bash
sudo apt install openjdk-8-jdk
sudo update-alternatives --config java
sudo update-alternatives --config javac
```

Or force it for Maven:

```bash
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
```

Then:

```bash
javac -version
mvn -version
```

> **Note**: It has been successfully built the project using OpenJDK 17.0.15 (2025-04-15). While Java 8 remains the officially recommended version for compatibility, newer versions like Java 17 may work depending on your environment.

---

## ✅ Step 5: Deploy and verify the connector

Copy the compiled JAR into the Kafka Connect classpath.

Then verify the connector is loaded (after deploying `kafka-connector` service):

```bash
curl -s http://localhost:8083/connector-plugins | jq
```

You should see:

```json
{
  "class": "io.confluent.connect.jdbc.JdbcSinkConnector",
  "type": "sink",
  "version": "10.7.0"
}
```

---
# How to use the Custom Connector

## 🌍 Send geometry data (WKB) to Kafka

Kafka Connect expects geometries using WKB + SRID in this schema:

```json
{
  "schema": {
    "type": "struct",
    "fields": [
      {"field": "entityid", "type": "string"},
      {"field": "timeinstant", "type": "string"},
      {
        "field": "geom",
        "name": "io.debezium.data.geometry.Geometry",
        "type": "struct",
        "fields": [
          {"field": "wkb", "type": "bytes"},
          {"field": "srid", "type": "int32"}
        ]
      }
    ],
    "optional": false
  },
  "payload": {
    "entityid": "some-id",
    "timeinstant": "2025-05-13T18:00:00.000Z",
    "geom": {
      "wkb": "AQEAAAD/////AA==",
      "srid": 4326
    }
  }
}
```

> The connector uses `io.debezium.data.geometry.Geometry` as the field schema type, this is what the [PR #1048](https://github.com/confluentinc/kafka-connect-jdbc/pull/1048) included.
> 💡 WKB should be Base64 encoded if you're using JSON serialization.

---

## 🧪 Convert WKT to WKB in Python

As implemented in the `faust` service, you can generate WKB using Python + Shapely:

```python
from shapely import wkt
import base64

def wkt_to_wkb_base64(wkt_str):
    geom = wkt.loads(wkt_str)
    return base64.b64encode(geom.wkb).decode("ascii")

print(wkt_to_wkb_base64("POINT(-3.7038 40.4168)"))
```

---

# ✅ Conclusion

You now have:

- A compiled Kafka Connect JDBC Sink with PostGIS (WKB) support
- Geometry data flowing in binary-safe format
- Compatibility with Debezium-style geometry schema

You're ready to send geospatial data to PostgreSQL/PostGIS via Kafka Connect!
