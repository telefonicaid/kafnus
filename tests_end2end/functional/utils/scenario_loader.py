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
from common_test import OrionRequestData
from config import logger

def load_scenario(json_path, as_expected=False):
    """
    Loads a test scenario from a JSON file.

    If loading expected PostGIS data (`as_expected=True`), returns a list of table data dictionaries.
    If loading an Orion scenario (`as_expected=False`), parses it into an OrionRequestData object.

    Parameters:
    - json_path: Path to the JSON scenario file.
    - as_expected: Whether the file represents expected PostGIS output data.

    Returns:
    - A list of dictionaries (if `as_expected=True`) or an OrionRequestData object.
    """
    logger.debug(f"📂 Loading scenario file: {json_path}")

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if as_expected:
        logger.debug("📦 Loading as expected PostGIS result")
        return data if isinstance(data, list) else [data]
    else:
        logger.debug(f"🛰️ Loading as Orion scenario: {data.get('name')}")
        return OrionRequestData(
            name=data["name"],
            service=data["fiware-service"],
            subservice=data["fiware-servicepath"],
            subscriptions=data["subscriptions"],
            updateEntities=data["updateEntities"]
        )
