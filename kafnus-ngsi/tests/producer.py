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

import json
import argparse
from kafka import KafkaProducer

VALID_FLOWS = {
    "historic": "raw_historic",
    "lastdata": "raw_lastdata",
    "mutable": "raw_mutable",
    "errors": "errors",
    "mongo": "raw_mongo",
    "sgtr": "raw_sgtr"
}

DEFAULT_SUBSCRIPTION_ID = "DefaultSubscriptionId"


def transform_old_to_new(notification):
    """
    Converts old formats (with 'body' or with object 'payload') to the new format:
    {"schema": {...}, "payload": "<stringified NGSI data>"}
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

    # return {
    #     "schema": {"type": "string", "optional": False},
    #     "payload": json.dumps(payload_obj)
    # }
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
    if "schema" in notification and "payload" in notification:
        # Already in new format
        # kafka_value = {
        #     "schema": notification["schema"],
        #     "payload": notification["payload"]
        # }
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
