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

FROM confluentinc/cp-kafka-connect:8.0.0

USER root

# -----------------------------
# Install build dependencies
# -----------------------------
RUN microdnf install -y \
    java-17-openjdk-devel \
    git \
    tar \
    gzip \
    && microdnf clean all

# Upgrade certificates
RUN microdnf update -y && \
    microdnf install -y ca-certificates && \
    update-ca-trust && \
    microdnf clean all

# Install Maven 3.9.7
RUN microdnf install -y curl-minimal && \
    curl -fsSL https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.7/apache-maven-3.9.7-bin.tar.gz \
    -o /tmp/apache-maven-3.9.7-bin.tar.gz && \
    tar xf /tmp/apache-maven-3.9.7-bin.tar.gz -C /opt && \
    ln -s /opt/apache-maven-3.9.7 /opt/maven && \
    rm /tmp/apache-maven-3.9.7-bin.tar.gz && \
    microdnf clean all

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk
ENV MAVEN_HOME=/opt/maven
ENV PATH="${JAVA_HOME}/bin:${MAVEN_HOME}/bin:${PATH}"

# -----------------------------
# Create plugin directories
# -----------------------------
RUN mkdir -p /usr/local/share/kafnus-connect/plugins \
    && chown -R appuser:appuser /usr/local/share/kafnus-connect/plugins

# -----------------------------
# Build HeaderRouter
# -----------------------------
COPY src/header-router /tmp/header-router
RUN cd /tmp/header-router && \
    mvn clean package && \
    mkdir -p /usr/local/share/kafnus-connect/plugins/header-router && \
    cp target/header-router-1.0.0-jar-with-dependencies.jar /usr/local/share/kafnus-connect/plugins/header-router/header-router-1.0.0.jar

# -----------------------------
# Build JDBC Connector from PostGIS fork
# -----------------------------
RUN cd /tmp && \
    git clone https://github.com/telefonicaid/kafka-connect-jdbc-postgis.git && \
    cd kafka-connect-jdbc-postgis && \
    git checkout task/upgrade_10_8_4  && \
    mvn clean package -DskipTests -Dcheckstyle.skip=true && \
    mkdir -p /usr/local/share/kafnus-connect/plugins/kafka-connect-jdbc && \
    cp target/kafka-connect-jdbc-10.8.4.jar /usr/local/share/kafnus-connect/plugins/kafka-connect-jdbc/

# PostgreSQL JDBC Driver
RUN curl -fsSL https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.1/postgresql-42.7.1.jar -o /usr/local/share/kafnus-connect/plugins/kafka-connect-jdbc/postgresql-42.7.1.jar

# -----------------------------
# MongoDB Kafka Connector
# -----------------------------
RUN mkdir -p /usr/local/share/kafnus-connect/plugins/mongodb && \
    curl -fsSL https://repo.maven.apache.org/maven2/org/mongodb/kafka/mongo-kafka-connect/1.10.0/mongo-kafka-connect-1.10.0-confluent.jar -o /usr/local/share/kafnus-connect/plugins/mongodb/mongo-kafka-connect-1.10.0-confluent.jar && \
    curl -fsSL https://repo1.maven.org/maven2/org/mongodb/mongodb-driver-core/4.9.1/mongodb-driver-core-4.9.1.jar -o /usr/local/share/kafnus-connect/plugins/mongodb/mongodb-driver-core-4.9.1.jar && \
    curl -fsSL https://repo1.maven.org/maven2/org/mongodb/mongodb-driver-sync/4.9.1/mongodb-driver-sync-4.9.1.jar -o /usr/local/share/kafnus-connect/plugins/mongodb/mongodb-driver-sync-4.9.1.jar && \
    curl -fsSL https://repo1.maven.org/maven2/org/mongodb/bson/4.9.1/bson-4.9.1.jar -o /usr/local/share/kafnus-connect/plugins/mongodb/bson-4.9.1.jar

# -----------------------------
# Http Kafka Connector
# -----------------------------
RUN confluent-hub install --no-prompt confluentinc/kafka-connect-http:1.7.0 && \
    ln -s /usr/share/confluent-hub-components/confluentinc-kafka-connect-http/lib /usr/local/share/kafnus-connect/plugins/http


# -----------------------------
# JMX Exporter Agent
# -----------------------------
RUN mkdir -p /usr/share/jmx_exporter && \
    curl -fsSL https://repo1.maven.org/maven2/io/prometheus/jmx/jmx_prometheus_javaagent/0.20.0/jmx_prometheus_javaagent-0.20.0.jar -o /usr/share/jmx_exporter/jmx_prometheus_javaagent.jar

COPY monitoring/kafnus-connect.yml /usr/share/jmx_exporter/

# -----------------------------
# Set permissions and environment
# -----------------------------
RUN chown -R appuser:appuser /usr/local/share/kafnus-connect/plugins /usr/share/jmx_exporter

USER appuser

ENV CONNECT_PLUGIN_PATH="/usr/local/share/kafnus-connect/plugins:/usr/share/java"
ENV KAFKA_JMX_PORT=9100
ENV JMX_PROMETHEUS_PORT=9100
ENV JMX_PROMETHEUS_EXPORTER_OPTS="-javaagent:/usr/share/jmx_exporter/jmx_prometheus_javaagent.jar=9100:/usr/share/jmx_exporter/kafnus-connect.yml"
