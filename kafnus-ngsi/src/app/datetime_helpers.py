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

def to_epoch_seconds(value: str) -> float:
    """
    Converts an ISO8601 string to epoch seconds (UTC).
    """
    try:
        dt = parser.isoparse(value.replace("Z", "+00:00"))
        return dt.timestamp()
    except Exception as e:
        logger.warning(f"⚠️ Could not convert '{value}' to epoch seconds: {e}")
        return 0.0

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
            return to_epoch_seconds(ts)
    except Exception as e:
        logger.warning(f"⚠️ Failed to extract timestamp: {e}")
    return 0.0