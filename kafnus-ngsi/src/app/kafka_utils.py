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
from app.types_utils import infer_field_type
from app.datetime_helpers import format_datetime_iso

def to_kafnus_connect_schema(entity: dict, schema_overrides: dict = None):
    """
    Builds a Kafnus Connect compatible schema and payload dict from the entity dict.
    Allows overriding field schemas (used mainly for geo or datetime attributes).
    """
    schema_fields = []
    payload = {}

    if schema_overrides is None:
        schema_overrides = {}

    for k, v in entity.items():
        if k in schema_overrides:
            schema_fields.append(schema_overrides[k])
            payload[k] = v
            continue

        # Treat 'timeinstant' and 'recvtime' as ISO strings, always
        if k.lower() in {"timeinstant", "recvtime"}:
            field_type = "string"
            is_optional = v is None
            schema_fields.append({
                "field": k,
                "type": field_type,
                "optional": is_optional
            })
            payload[k] = str(v)
            continue

        field_type, v = infer_field_type(k, v)
        is_optional = v is None

        if isinstance(field_type, dict):
            schema_field = {
                "field": k,
                **field_type,
                "optional": is_optional
            }
        else:
            schema_field = {
                "field": k,
                "type": field_type,
                "optional": is_optional
            }

        schema_fields.append(schema_field)
        payload[k] = v

    # Add recvtime (current timestamp) explicitly
    schema_fields.append({
        "field": "recvtime",
        "type": "string",
        "optional": False
    })
    payload["recvtime"] = format_datetime_iso(tz='UTC')

    return {
        "schema": {
            "type": "struct",
            "fields": schema_fields,
            "optional": False
        },
        "payload": payload
    }


def build_kafka_key(entity: dict, key_fields: list, include_timeinstant=False):
    """
    Builds the Kafka message key with schema based on key_fields and optionally timeinstant.
    This key is used for Kafnus Connect upsert mode or primary key definition.
    """
    fields = []
    payload = {}

    for key in key_fields:
        fields.append({"field": key, "type": "string", "optional": False})
        payload[key] = entity.get(key)

    if include_timeinstant:
        fields.append({"field": "timeinstant", "type": "string", "optional": False})
        payload["timeinstant"] = entity.get("timeinstant")

    return json.dumps({
        "schema": {
            "type": "struct",
            "fields": fields,
            "optional": False
        },
        "payload": payload
    }).encode("utf-8")