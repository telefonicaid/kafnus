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
}

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
    parser.add_argument('archivo_json', type=str, help='Path to the JSON file with notification')
    args = parser.parse_args()

    # Load notification from file
    with open(args.archivo_json) as f:
        notificacion = json.load(f)

    # Determine topic based on 'flow'
    flow = notificacion.get("flow", "").lower()
    topic = VALID_FLOWS.get(flow)

    if topic is None:
        print(f"❌ Invalid or missing 'flow' value: '{flow}'. Must be one of: {list(VALID_FLOWS.keys())}")
        return

    # Configure Kafka producer
    producer = KafkaProducer(
        bootstrap_servers='localhost:9092',
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

    # Send notification to selected topic
    producer.send(topic, value=notificacion)
    producer.flush()

    print(f"✅ Notification sent successfully to topic: {topic}")

if __name__ == "__main__":
    send_notification()
