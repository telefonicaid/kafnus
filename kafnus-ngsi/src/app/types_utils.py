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

import pytz
import json
import re
from shapely import wkt
from shapely.geometry import shape # https://shapely.readthedocs.io/en/stable/manual.html#shapely.geometry.shape
import base64
from app.datetime_helpers import normalize_datetime_string, is_possible_datetime, to_epoch_millis

import logging
logger = logging.getLogger(__name__)

def to_wkb_struct_from_wkt(wkt_str, field_name, srid=4326):
    """
    Converts a WKT geometry string to a Debezium-compatible WKB struct with schema and base64-encoded payload.
    Used for sending geo attributes in Kafnus Connect format.
    """
    try:
        geom = wkt.loads(wkt_str)
        wkb = geom.wkb
        wkb_b64 = base64.b64encode(wkb).decode("ascii")
        return {
            "schema": {
                "field": field_name,
                "type": "struct",
                "name": "io.debezium.data.geometry.Geometry",
                "fields": [
                    {"field": "wkb", "type": "bytes"},
                    {"field": "srid", "type": "int32"}
                ],
                "optional": False
            },
            "payload": {
                "wkb": wkb_b64,
                "srid": srid
            }
        }
    except Exception as e:
        logger.error(f"❌ Error generating WKB from WKT: {e}")
        return None


def to_wkt_geometry(attr_type, attr_value):
    """
    Converts NGSI geo attributes (geo:point, geo:polygon, geo:json) to WKT string.
    Supports extension for additional geo types if needed.
    """
    try:
        if attr_type == "geo:point":
            if isinstance(attr_value, str):
                lat, lon = map(float, attr_value.split(','))
                return f"POINT ({lon} {lat})"
        elif attr_type == "geo:polygon":
            coords = []
            for coord_str in attr_value:
                lat, lon = map(float, coord_str.split(','))
                coords.append(f"{lon} {lat}")
            coords_str = ", ".join(coords)
            return f"POLYGON (({coords_str}))"
        elif attr_type == "geo:json":
            geom = shape(attr_value)
            return geom.wkt
    except Exception as e:
        logger.error(f"❌ Error generating WKT from type '{attr_type}': {e}")
    return None

def sanitize_topic(name):
    """
    Sanitizes a string to be a valid Kafka topic name by replacing disallowed characters with underscores.
    """
    return re.sub(r'[^a-zA-Z0-9_]', '_', name.strip('/').lower())


def infer_field_type(name, value, attr_type=None):
    """
    Infers Kafnus Connect field type from NGSI attrType or Python native type.
    Also transforms the value if needed (e.g. formatting dates, serializing JSON).
    Returns a tuple (field_type, processed_value).
    """
    name_lc = name.lower()

    if attr_type:
        if attr_type.startswith("geo:"):
            return "geometry", value  # handled externally

        if attr_type == "DateTime":
            if name_lc in {"timeinstant", "recvtime"}:
                # Keep as ISO string for known fields
                return "string", str(value)
            try:
                epoch_ms = to_epoch_millis(value)
                return {
                    "type": "int64",
                    "name": "org.apache.kafka.connect.data.Timestamp"
                }, epoch_ms
            except Exception as e:
                logger.warning(f"⚠️ Error parsing datetime for field '{name}': {e}")
                return "string", str(value)
        elif attr_type == "Number":
            return "float", value
        elif attr_type == "Integer":
            return "int32", value
        elif attr_type == "Boolean":
            return "boolean", value
        elif attr_type in {"json", "StructuredValue"}:
            try:
                return "string", json.dumps(value, ensure_ascii=False)
            except Exception as e:
                logger.warning(f"⚠️ Error serializing '{name}' as JSON: {e}")
                return "string", str(value)
        else:  # attr_type == "Text", or unknown
            return "string", value

    # Fallback to guessing by name/value
    if name_lc in {"timeinstant", "recvtime"}:
        return "string", str(value)

    if is_possible_datetime(value):
        try:
            epoch_ms = to_epoch_millis(value)
            return {
                "type": "int64",
                "name": "org.apache.kafka.connect.data.Timestamp"
            }, epoch_ms
        except Exception as e:
            logger.warning(f"⚠️ Error parsing datetime for field '{name}': {e}")
            return "string", str(value)

    if isinstance(value, bool):
        return "boolean", value
    elif isinstance(value, int):
        return "int32", value
    elif isinstance(value, float):
        return "float", value
    elif isinstance(value, (list, dict)):
        # Catch StructuredValues without attr_type
        try:
            return "string", json.dumps(value, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"⚠️ Error serializing '{name}' as JSON: {e}")
            return "string", str(value)
    else:
        return "string", value
    
def encode_mongo(value: str) -> str:
    if value == '/':
        return 'x002f'
    value = value.replace('/', 'x002f')
    value = value.replace('.', 'x002e')
    value = value.replace('$', 'x0024')
    value = value.replace('"', 'x0022')
    value = value.replace('=', 'xffff')
    return value