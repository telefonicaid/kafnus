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
