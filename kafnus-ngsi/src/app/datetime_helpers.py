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

from datetime import datetime, timezone
import pytz
from dateutil import parser
import logging

logger = logging.getLogger(__name__)

def parse_datetime(value: str, tz='UTC') -> datetime:
    """
    Parses a date string into a datetime object and converts it to UTC (or given tz).
    Supports flexible ISO formats and Z suffix.
    """
    try:
        dt = parser.isoparse(value.replace("Z", "+00:00"))
        return dt.astimezone(pytz.timezone(tz))
    except Exception as e:
        logger.warning(f"⚠️ Failed to parse datetime '{value}': {e}")
        raise

def format_datetime_iso(dt: datetime = None, tz='UTC') -> str:
    """
    Formats a datetime object to ISO8601 string with milliseconds and timezone offset.
    Defaults to now() in UTC if dt is None.
    """
    tz_obj = pytz.timezone(tz)
    if dt is None:
        dt = datetime.now(tz_obj)
    else:
        dt = dt.astimezone(tz_obj)
    return dt.isoformat(timespec='milliseconds')

def normalize_datetime_string(value: str, tz='UTC') -> str:
    """
    Parses and formats a datetime string into canonical ISO8601 with ms and TZ offset.
    Useful for preparing date strings for Kafka Connect.
    """
    try:
        dt = parse_datetime(value, tz)
        return format_datetime_iso(dt, tz)
    except Exception as e:
        logger.error(f"❌ Could not normalize datetime '{value}': {e}")
        return value  # fallback to original

def is_possible_datetime(value: str) -> bool:
    """
    Returns True if the string could reasonably be a datetime.
    """
    try:
        parser.parse(value)
        return True
    except Exception:
        return False

def to_epoch_millis(value: str) -> int:
    """
    Converts an ISO8601 string to epoch milliseconds (UTC).
    """
    try:
        dt = parser.isoparse(value.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception as e:
        logger.warning(f"⚠️ Could not convert '{value}' to epoch millis: {e}")
        return 0

def current_epoch_millis():
    """
    Returns the current UTC time as milliseconds since Unix epoch.
    Compatible with Kafka Connect 'Timestamp' schema type.
    """
    return int(datetime.now(tz=pytz.UTC).timestamp() * 1000)

def extract_timeinstant_epoch(entity: dict) -> float:
    """
    Extracts 'TimeInstant.value' or 'timestamp' from entity and returns as epoch seconds.
    """
    try:
        if isinstance(entity.get("TimeInstant"), dict):
            ts = entity["TimeInstant"].get("value")
        else:
            ts = entity.get("timestamp")

        if ts:
            return to_epoch_millis(ts)
    except Exception as e:
        logger.warning(f"⚠️ Failed to extract timestamp: {e}")
    return 0.0