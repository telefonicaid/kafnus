#!/bin/sh

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

set -e

CONFIG_FILE="/home/appuser/config/connect-distributed.properties"

cat > "${CONFIG_FILE}" <<EOF
bootstrap.servers=${CONNECT_BOOTSTRAP_SERVERS:-kafka:9092}
group.id=${CONNECT_GROUP_ID:-connect-cluster}

key.converter=${CONNECT_KEY_CONVERTER:-org.apache.kafka.connect.storage.StringConverter}
value.converter=${CONNECT_VALUE_CONVERTER:-org.apache.kafka.connect.json.JsonConverter}
value.converter.schemas.enable=${CONNECT_VALUE_CONVERTER_SCHEMAS_ENABLE:-true}

config.storage.topic=${CONNECT_CONFIG_STORAGE_TOPIC:-connect-configs}
offset.storage.topic=${CONNECT_OFFSET_STORAGE_TOPIC:-connect-offsets}
status.storage.topic=${CONNECT_STATUS_STORAGE_TOPIC:-connect-status}

config.storage.replication.factor=${CONNECT_CONFIG_STORAGE_REPLICATION_FACTOR:-1}
offset.storage.replication.factor=${CONNECT_OFFSET_STORAGE_REPLICATION_FACTOR:-1}
status.storage.replication.factor=${CONNECT_STATUS_STORAGE_REPLICATION_FACTOR:-1}

plugin.path=${CONNECT_PLUGIN_PATH:-/usr/local/share/kafnus-connect/plugins}

rest.port=${CONNECT_REST_PORT:-8083}
rest.advertised.host.name=${CONNECT_REST_ADVERTISED_HOST_NAME:-kafnus-connect}

config.providers=env
config.providers.env.class=org.apache.kafka.common.config.provider.EnvVarConfigProvider
EOF

echo ">> Starting Kafka Connect with config:"
cat "${CONFIG_FILE}"

exec "${KAFKA_HOME}/bin/connect-distributed.sh" "${CONFIG_FILE}"
