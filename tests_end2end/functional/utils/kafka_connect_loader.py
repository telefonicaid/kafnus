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
import requests
from pathlib import Path

from config import KAFNUS_TESTS_KAFKA_CONNECT_URL

def deploy_all_sinks(sinks_dir: Path, KAFNUS_TESTS_KAFKA_CONNECT_URL: str = KAFNUS_TESTS_KAFKA_CONNECT_URL):
    """
    Deploys all Kafka Connect sink connectors defined as JSON files in the given directory.

    For each JSON file:
    - Loads the configuration.
    - Extracts the connector name.
    - Sends a POST request to Kafka Connect to deploy the connector.

    Parameters:
    - sinks_dir: Path to the directory containing JSON sink connector definitions.
    - KAFNUS_TESTS_KAFKA_CONNECT_URL: URL to the Kafka Connect REST API (defaults to KAFNUS_TESTS_KAFKA_CONNECT_URL).
    """
    for file in sinks_dir.glob("*.json"):
        with file.open("r", encoding="utf-8") as f:
            config = json.load(f)
        name = config.get("name")
        if not name:
            print(f"⚠️  File {file} does not have 'name', skipping.")
            continue
        try:
            res = requests.post(
                f"{KAFNUS_TESTS_KAFKA_CONNECT_URL}/connectors",
                headers={"Content-Type": "application/json"},
                json=config
            )
            if res.status_code in [200, 201, 409]:
                print(f"✅ Sink {name} deployed.")
            else:
                print(f"❌ Error deploying {name}: {res.status_code}, {res.text}")
        except Exception as e:
            print(f"❌ Connection error with Kafka Connect: {e}")
