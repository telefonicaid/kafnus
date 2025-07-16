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
from datetime import datetime, timezone


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
        print(f"❌ Error generating WKB from WKT: {e}")
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
        print(f"❌ Error generating WKT ({attr_type}): {e}")
    return None


def format_timestamp(dt=None, tz='UTC'):
    tz_obj = pytz.timezone(tz)
    if dt is None:
        dt = datetime.now(tz_obj)
    else:
        dt = dt.astimezone(tz_obj)
    return dt.isoformat(timespec='milliseconds')

def extract_timestamp(entity: dict) -> float:
    """
    Extract and transform to epoch seconds
    """
    ts = entity.get("TimeInstant") or entity.get("timestamp")
    if ts:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.timestamp()
    return 0.0

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
    if attr_type:
        if attr_type.startswith("geo:"):
            return "geometry", value  # handled externally
        elif attr_type == "DateTime":
            try:
                dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
                value = format_timestamp(dt, tz='Europe/Madrid')
            except Exception as e:
                print(f"⚠️ Error formatting DateTime for '{name}': {e}")
            return "string", value
        elif attr_type == "Number":
            return "float", value
        elif attr_type == "Integer":
            return "int32", value
        elif attr_type == "Boolean":
            return "boolean", value
        elif attr_type == "json":
            try:
                return "string", json.dumps(value, ensure_ascii=False)
            except Exception as e:
                print(f"⚠️ Error serializing {name} as JSON: {e}")
                return "string", str(value)
        elif attr_type == "Text":
            return "string", value

    # Fallback to Python type inference
    if isinstance(value, bool):
        return "boolean", value
    elif isinstance(value, int):
        return "int32", value
    elif isinstance(value, float):
        return "float", value
    elif name.lower() == "timeinstant":
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            dt = dt.astimezone(pytz.timezone('Europe/Madrid'))
            value = format_timestamp(dt, tz='Europe/Madrid')
        except Exception as e:
            print(f"⚠️ Error formatting timeinstant: {e}")
        return "string", value
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