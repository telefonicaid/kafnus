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

from config import logger
from config import KAFNUS_TESTS_KAFNUS_CONNECT_URL

def deploy_all_sinks(sinks_dir: Path, kafnus_connect_url: str = KAFNUS_TESTS_KAFNUS_CONNECT_URL):
    """
    Deploys all Kafnus Connect sink connectors defined as JSON files in the given directory.

    For each JSON file:
    - Loads the configuration.
    - Extracts the connector name.
    - Sends a POST request to Kafnus Connect to deploy the connector.

    Parameters:
    - sinks_dir: Path to the directory containing JSON sink connector definitions.
    - kafnus_connect_url: URL to the Kafnus Connect REST API (defaults to KAFNUS_TESTS_KAFNUS_CONNECT_URL).
    """
    logger.info(f"📤 Deploying all sinks from directory: {sinks_dir}")

    for file in sinks_dir.glob("*.json"):
        logger.debug(f"🔍 Reading file: {file}")
        with file.open("r", encoding="utf-8") as f:
            config = json.load(f)
        name = config.get("name")

        if not name:
            logger.warning(f"⚠️ File {file.name} does not have 'name', skipping.")
            continue

        try:
            res = requests.post(
                f"{kafnus_connect_url}/connectors",
                headers={"Content-Type": "application/json"},
                json=config
            )
            if res.status_code in [200, 201, 409]:
                logger.info(f"✅ Sink {name} deployed (status: {res.status_code})")
            else:
                logger.error(f"❌ Error deploying {name} : {res.status_code}, {res.text}")
        except Exception as e:
            logger.error(f"❌ Connection error with Kafnus Connect for {name}: {e}")