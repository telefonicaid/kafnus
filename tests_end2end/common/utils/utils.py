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

import requests

from common.config import logger

def _clean_headers_for_get(headers):
    # Orion forbids Content-Type on GET/DELETE
    return {k: v for k, v in headers.items() if k.lower() != "content-type"}


def find_subscription_id_by_description(orion_baseUrl, description, headers):
    """
    List subscriptions in Orion and search by 'description'.
    Returns the id if found, or None.
    """
    headers_ = _clean_headers_for_get(headers)
    resp = requests.get(f"{orion_baseUrl}/subscriptions", headers=headers_)
    if resp.status_code != 200:
        logger.error(f"Failed to list subscriptions: {resp.status_code} {resp.content}")
        return None

    try:
        subs = resp.json()
    except Exception:
        logger.exception("Failed parsing subscriptions JSON")
        return None

    for s in subs:
        if s.get("description") == description:
            return s.get("id")
    return None
