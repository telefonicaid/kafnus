#!/bin/sh
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
EOF

echo ">> Starting Kafka Connect with config:"
cat "${CONFIG_FILE}"

exec "${KAFKA_HOME}/bin/connect-distributed.sh" "${CONFIG_FILE}"
