# Copyright 2025 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
# PROJECT: Kafnus
#
# This software and / or computer program has been developed by Telefónica Soluciones
# de Informática y Comunicaciones de España, S.A.U (hereinafter TSOL) and is protected
# as copyright by the applicable legislation on intellectual property.
#
# It belongs to TSOL, and / or its licensors, the exclusive rights of reproduction,
# distribution, public communication and transformation, and any economic right on it,
# all without prejudice of the moral rights of the authors mentioned above. It is expressly
# forbidden to decompile, disassemble, reverse engineer, sublicense or otherwise transmit
# by any means, translate or create derivative works of the software and / or computer
# programs, and perform with respect to all or part of such programs, any type of exploitation.
#
# Any use of all or part of the software and / or computer program will require the
# express written consent of TSOL. In all cases, it will be necessary to make
# an express reference to TSOL ownership in the software and / or computer
# program.
#
# Non-fulfillment of the provisions set forth herein and, in general, any violation of
# the peaceful possession and ownership of these rights will be prosecuted by the means
# provided in both Spanish and international law. TSOL reserves any civil or
# criminal actions it may exercise to protect its rights.

FROM openjdk:17-jdk-slim

ARG KAFKA_VERSION=4.1.0
ARG SCALA_VERSION=2.13
ENV KAFKA_HOME=/opt/kafka
ENV CONNECT_PLUGIN_PATH=/usr/local/share/kafnus-connect/plugins

## -----------------------------
## Build tools
## -----------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git tar gzip maven ca-certificates wget unzip gnupg2 \
    && rm -rf /var/lib/apt/lists/*

## -----------------------------
## Download Kafka (official distribution)
## -----------------------------
RUN mkdir -p /opt && \
    cd /opt && \
    curl -fsSL "https://downloads.apache.org/kafka/${KAFKA_VERSION}/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz" \
      -o /tmp/kafka.tgz && \
    tar -xzf /tmp/kafka.tgz -C /opt && \
    ln -s /opt/kafka_${SCALA_VERSION}-${KAFKA_VERSION} ${KAFKA_HOME} && \
    rm /tmp/kafka.tgz

## -----------------------------
## Plugin directories
## -----------------------------
RUN mkdir -p ${CONNECT_PLUGIN_PATH}

## -----------------------------
## Non-root user
## -----------------------------
RUN groupadd -r appuser && useradd -r -g appuser -m -d /home/appuser appuser && \
    chown -R appuser:appuser ${KAFKA_HOME} ${CONNECT_PLUGIN_PATH}
USER appuser
WORKDIR ${KAFKA_HOME}

## -----------------------------
## Custom SMT: HeaderRouter
## -----------------------------
USER root
COPY src/header-router /usr/local/build/header-router
RUN cd /usr/local/build/header-router && \
    mvn clean package -DskipTests && \
    mkdir -p ${CONNECT_PLUGIN_PATH}/header-router && \
    cp target/header-router-1.0.0-jar-with-dependencies.jar \
       ${CONNECT_PLUGIN_PATH}/header-router/header-router-1.0.0.jar && \
    rm -rf /usr/local/build/header-router
USER appuser

## -----------------------------
## Connectors
## -----------------------------

## JDBC Connector (PostGIS fork)
RUN cd /tmp && \
    git clone https://github.com/telefonicaid/kafka-connect-jdbc-postgis.git && \
    cd kafka-connect-jdbc-postgis && \
    git checkout version10.8.4 || true && \
    mvn clean package -DskipTests -Dcheckstyle.skip=true && \
    mkdir -p ${CONNECT_PLUGIN_PATH}/kafka-connect-jdbc && \
    cp target/kafka-connect-jdbc-10.8.4.jar ${CONNECT_PLUGIN_PATH}/kafka-connect-jdbc/ && \
    rm -rf /tmp/kafka-connect-jdbc-postgis

## PostgreSQL JDBC Driver
RUN curl -fsSL https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.8/postgresql-42.7.8.jar \
    -o ${CONNECT_PLUGIN_PATH}/kafka-connect-jdbc/postgresql-42.7.8.jar

## MongoDB Kafka Connector (MongoDB official version - full jar)
RUN mkdir -p ${CONNECT_PLUGIN_PATH}/mongodb && \
    curl -fsSL https://repo1.maven.org/maven2/org/mongodb/kafka/mongo-kafka-connect/2.0.1/mongo-kafka-connect-2.0.1-all.jar \
      -o ${CONNECT_PLUGIN_PATH}/mongodb/mongo-kafka-connect-2.0.1-all.jar

## HTTP Connector (telefonicaid fork)
RUN cd /tmp && \
    git clone https://github.com/telefonicaid/http-connector-for-apache-kafka-graphql.git && \
    cd http-connector-for-apache-kafka-graphql && \
    git checkout version0.9.0 || true && \
    ./gradlew clean distTar && \
    mkdir -p ${CONNECT_PLUGIN_PATH}/http-connector && \
    tar xfv build/distributions/http-connector-for-apache-kafka-0.9.0.tar -C ${CONNECT_PLUGIN_PATH}/http-connector --strip-components=1 && \
    rm -rf /tmp/http-connector-for-apache-kafka-graphql

## -----------------------------
## JMX Exporter
## -----------------------------
RUN mkdir -p /home/appuser/jmx_exporter && \
    curl -fsSL https://repo1.maven.org/maven2/io/prometheus/jmx/jmx_prometheus_javaagent/0.20.0/jmx_prometheus_javaagent-0.20.0.jar \
      -o /home/appuser/jmx_exporter/jmx_prometheus_javaagent.jar

## -----------------------------
## Config directory for Kafka Connect
## -----------------------------
RUN mkdir -p /home/appuser/config
ENV LOG_DIR=/home/appuser/logs
RUN mkdir -p ${LOG_DIR}

## Fix Java 17 + cgroups v2 issue
ENV JAVA_TOOL_OPTIONS="-XX:+UnlockExperimentalVMOptions -XX:-UseContainerSupport"

## -----------------------------
## Entrypoint
## -----------------------------
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

ENV PATH="${KAFKA_HOME}/bin:${PATH}"
ENV KAFKA_JMX_PORT=9100
ENV JMX_PROMETHEUS_PORT=9100

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["connect-distributed", "/home/appuser/config/connect-distributed.properties"]

