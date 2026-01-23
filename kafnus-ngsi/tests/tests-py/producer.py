# Copyright 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
#
# This file is part of kafnus
#
# kafnus is free software: you can redistribute it and/or
# modify it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# kafnus is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
# General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with kafnus. If not, see http://www.gnu.org/licenses/.
#
# Authors: 
#  - Álvaro Vega
#  - Gregorio Blázquez

import json
import argparse
from kafka import KafkaProducer

VALID_FLOWS = {
    "historic": "smc_raw_historic",
    "lastdata": "smc_raw_lastdata",
    "mutable": "smc_raw_mutable",
    "errors": "smc_errors",
    "mongo": "smc_raw_mongo",
    "sgtr": "smc_raw_sgtr"
}

DEFAULT_SUBSCRIPTION_ID = "DefaultSubscriptionId"


def transform_old_to_new(notification):
    """
    Converts old formats (with 'body' or with object 'payload') to the new format:
    < NGSI data>"
    """

    # Support body-based format
    if "body" in notification:
        body = notification.get("body", {})
        entity_id = body.get("entityId")
        entity_type = body.get("entityType")
        attributes = body.get("attributes", [])

    # Support payload-based format (object, not string)
    elif isinstance(notification.get("payload"), dict):
        body = notification.get("payload", {})
        entity_id = body.get("entityId")
        entity_type = body.get("entityType")
        attributes = body.get("attributes", [])

    else:
        raise ValueError("Notification does not contain a valid 'body' or object 'payload' to transform.")

    data_item = {
        "id": entity_id,
        "type": entity_type
    }

    for attr in attributes:
        name = attr.get("attrName")
        value = attr.get("attrValue")
        attr_type = attr.get("type")

        if attr_type:
            data_item[name] = {
                "type": attr_type,
                "value": value,
                "metadata": {}
            }
        else:
            data_item[name] = {
                "value": value
            }

    payload_obj = {
        "subscriptionId": DEFAULT_SUBSCRIPTION_ID,
        "data": [data_item]
    }
    return payload_obj


def send_notification():
    """
    Sends an NGSI-style notification (loaded from a JSON file) to a Kafka topic.

    The topic is selected based on the 'flow' field in the JSON payload,
    which must match one of the predefined valid flows.

    Prints:
        - An error message if the 'flow' is missing or invalid.
        - A success message if the notification is sent correctly.
    """
    parser = argparse.ArgumentParser(description='Send NGSI notification to Kafka')
    parser.add_argument('json_file', type=str, help='Path to the JSON file with notification')
    args = parser.parse_args()

    with open(args.json_file) as f:
        notification = json.load(f)

    # Determine topic
    flow = notification.get("flow", "").lower()
    topic = VALID_FLOWS.get(flow)
    if topic is None:
        print(f"❌ Invalid or missing 'flow' value: '{flow}'. Must be one of: {list(VALID_FLOWS.keys())}")
        return

    # Kafka headers
    headers_dict = notification.get("headers", {})
    kafka_headers = []
    for hk, hv in headers_dict.items():
        if hv is not None:
            kafka_headers.append((hk, str(hv).encode("utf-8")))

    # Determine value
    if "payload" in notification:
        # Already in new format
        kafka_value = notification["payload"]
    else:
        kafka_value = transform_old_to_new(notification)

    # Kafka producer
    producer = KafkaProducer(
        bootstrap_servers='localhost:9092',
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

    producer.send(topic, value=kafka_value, headers=kafka_headers)
    producer.flush()

    print(f"✅ Notification sent to topic: {topic} with headers: {kafka_headers}")


if __name__ == "__main__":
    send_notification()
