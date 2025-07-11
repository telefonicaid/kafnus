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

FROM confluentinc/cp-kafka-connect:7.9.0

# Create plugin directory with correct permissions
USER root
RUN mkdir -p /usr/local/share/kafka-connect/plugins && \
    chown -R appuser:appuser /usr/local/share/kafka-connect/plugins

# Copy all plugins to an alternative location with proper permissions
COPY --chown=appuser:appuser plugins/ /usr/local/share/kafka-connect/plugins/

# Copy monitoring configuration
COPY monitoring/jmx_prometheus_javaagent.jar /usr/share/jmx_exporter/
COPY monitoring/kafka-connect.yml /usr/share/jmx_exporter/

# Switch back to the original user (appuser)
USER appuser

# Default environment variables
ENV CONNECT_PLUGIN_PATH="/usr/local/share/kafka-connect/plugins:/usr/share/java"
ENV KAFKA_JMX_PORT=9100
ENV JMX_PROMETHEUS_PORT=9100
ENV JMX_PROMETHEUS_EXPORTER_OPTS="-javaagent:/usr/share/jmx_exporter/jmx_prometheus_javaagent.jar=9100:/usr/share/jmx_exporter/kafka-connect.yml"
