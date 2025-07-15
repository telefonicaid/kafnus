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

import time
import json
import re
from datetime import datetime, timezone

from app.types_utils import sanitize_topic, extract_timestamp, format_timestamp, encode_mongo
from app.kafka_utils import build_kafka_key
from app.entity_handler import handle_entity, build_target_table, handle_entity_cb
from app.metrics import start_metrics_server, messages_processed, processing_time
from app.faust_app import app, raw_historic_topic, raw_lastdata_topic, raw_mutable_topic, raw_errors_topic, mongo_output_topic, mongo_topic

import logging
logger = logging.getLogger(__name__)

DATAMODEL = "dm-by-entity-type-database"

# Historic Agent
@app.agent(raw_historic_topic)
async def process_historic(stream):
    """
    Consumes raw NGSI notifications from the 'raw_historic' topic and processes them as historic records.
    Each message is transformed to Kafka Connect format and forwarded to the corresponding output topic.
    Primary key includes entity ID and TimeInstant for proper versioning of historical data.
    """
    async for event in stream.events():
        start = time.time()
        try:
            raw_value = event.value
            headers = event.message.headers

            await handle_entity_cb(
                app,
                raw_value,
                headers=headers,
                suffix="",
                include_timeinstant=True,
                key_fields=["entityid"],
                datamodel=DATAMODEL
            )
        except Exception as e:
            logger.error(f"❌ [historic] Error processing event: {e}")

        
        duration = time.time() - start
        messages_processed.labels(flow="historic").inc()
        processing_time.labels(flow="historic").set(duration)



# Table of last timeinstant for entity
last_seen_timestamps = app.Table(
    'lastdata_entity_timeinstant',
    default=float,
    partitions=1  # Match the raw_lastdata topic
)

# Lastdata Agent
@app.agent(raw_lastdata_topic)
async def process_lastdata(stream):
    """
    Consumes NGSI notifications from the 'raw_lastdata' topic and stores the latest timestamp of each entity.
    If the notification timestamp is more recent than the previously seen one, the entity is updated.
    Handles deletion events explicitly by sending a null value with the proper key to trigger deletion in the sink.
    """
    async for event in stream.events():
        start = time.time()
        try:
            raw_value = event.value
            headers = event.message.headers
            header_dict = {k: v.decode() for k, v in headers}

            event_data = json.loads(raw_value)
            body = event_data.get("body", {})
            entity_id = body.get("id", "unknown")
            # IMPORTANT: THIS PART NEEDS TO BE CHECK ACCORDING TO CB NOTIFICATIONS
            alteration_type = event_data.get("alterationType")

            if not entity_id:
                continue
            
            service = header_dict.get("fiware-service", "default").lower()
            servicepath = header_dict.get("fiware-servicepath", "/")
            entity_type = body.get("type", "unknown").lower()

            if alteration_type == "entityDelete":
                delete_entity = {
                    "entityid": entity_id,
                    "entitytype": entity_type,
                    "fiwareservicepath": servicepath
                }

                target_table = build_target_table(service, servicepath, entity_id, entity_type, suffix="_lastdata", datamodel=DATAMODEL)
                topic_name = f"{service}_lastdata"
                output_topic = app.topic(topic_name)
                kafka_key = build_kafka_key(delete_entity, include_timeinstant=False)

                await output_topic.send(
                    key=kafka_key,
                    value=None,
                    headers=[("target_table", target_table.encode())]
                )
                last_seen_timestamps.pop(entity_id, None)
                logger.info(f"🗑️ [lastdata] Sent delete for entity: {entity_id}")
                continue

            # Check previous timestamp
            current_ts = extract_timestamp(body)
            last_ts = last_seen_timestamps[entity_id]

            if current_ts >= last_ts:
                # Normal update
                last_seen_timestamps[entity_id] = current_ts
                await handle_entity_cb(
                    app, raw_value,
                    headers=headers,
                    suffix="_lastdata",
                    include_timeinstant=False,
                    key_fields=["entityid"],
                    datamodel=DATAMODEL
                )
            else:
                logger.debug(f"⚠️ Ignored entity '{entity_id}' due to old timestamp ({current_ts} < {last_ts})")

        except Exception as e:
            logger.error(f"❌ [lastdata] Error processing event: {e}")

        duration = time.time() - start
        messages_processed.labels(flow="lastdata").inc()
        processing_time.labels(flow="lastdata").set(duration)


# Mutable Agent
@app.agent(raw_mutable_topic)
async def process_mutable(stream):
    """
    Consumes NGSI notifications from the 'raw_mutable' topic and stores them as mutable records.
    Includes TimeInstant in the primary key.
    """
    async for event in stream.events():
        start = time.time()
        try:
            raw_value = event.value
            headers = event.message.headers

            await handle_entity_cb(
                app,
                raw_value,
                headers=headers,
                suffix="_mutable",
                include_timeinstant=True,
                key_fields=["entityid"],
                datamodel=DATAMODEL
            )
        except Exception as e:
            logger.error(f"❌ [mutable] Error processing event: {e}")
        
        duration = time.time() - start
        messages_processed.labels(flow="mutable").inc()
        processing_time.labels(flow="mutable").set(duration)


# Errors Agent
@app.agent(raw_errors_topic)
async def process_errors(stream):
    """
    Processes Kafka Connect error messages from the 'raw_errors' topic.
    Parses failed inserts or connector issues, extracts the relevant SQL error message and context,
    and emits a structured error log message to a per-tenant error topic (e.g., 'clientname_error_log').
    """
    async for message in stream.events():
        start = time.time()

        headers = {k: v.decode("utf-8") for k, v in (message.message.headers or [])}
        value_raw = message.value

        try:
            value_json = json.loads(value_raw)
        except Exception as e:
            logger.warning(f"⚠️ Could not parse JSON payload: {e}")
            continue

        # Extract full error information
        full_error_msg = headers.get("__connect.errors.exception.message", "Unknown error")
        # Include cause if separated
        cause_msg = headers.get("__connect.errors.exception.cause.message")
        if cause_msg and cause_msg not in full_error_msg:
            full_error_msg += f"\nCaused by: {cause_msg}"
        
        # Get timestamp
        timestamp = format_timestamp(tz='Europe/Madrid')
        
        # Get database name
        db_name = headers.get("__connect.errors.topic", "")
        if db_name == "":
            db_name_match = re.search(r'INSERT INTO "([^"]+)"', full_error_msg)
            if db_name_match:
                db_name = db_name_match.group(1).split('.')[0]

        # Remove unwanted suffixes
        db_name = re.sub(r'_(lastdata|mutable)$', '', db_name)

        # Get name of output topic
        error_topic_name = f"{db_name}_error_log"
        error_topic = app.topic(error_topic_name, value_serializer='json')

        # Process error message
        error_match = re.search(r'(ERROR: .+?)(\n|$)', full_error_msg)
        if error_match:
            error_message = error_match.group(1).strip()

            # Add details if present
            detail_match = re.search(r'(Detail: .+?)(\n|$)', full_error_msg)
            if detail_match:
                error_message += f" - {detail_match.group(1).strip()}"
        else:
            error_message = full_error_msg

        # Extract query if aviable
        query_match = re.search(r'(INSERT INTO "[^"]+"[^)]+\)[^)]*\))', full_error_msg)
        if query_match:
            original_query = query_match.group(1)
        else:
            # Construct query from payload
            payload = value_json.get("payload", {})
            table = headers.get("target_table", "unknown_table")
            
            if payload:
                columns = ",".join(f'"{k}"' for k in payload.keys())
                values = []
                for k, v in payload.items():
                    if isinstance(v, str):
                        v = v.replace("'", "''")
                        values.append(f"'{v}'")
                    elif v is None:
                        values.append("NULL")
                    else:
                        values.append(str(v))
                values_str = ",".join(values)
                original_query = f'INSERT INTO "{db_name}"."{table}" ({columns}) VALUES ({values_str})'
            else:
                original_query = ""

        # Construct kafka message ready for connector
        error_record = {
            "schema": {
                "type": "struct",
                "fields": [
                    {"field": "timestamp", "type": "string", "optional": False},
                    {"field": "error", "type": "string", "optional": False},
                    {"field": "query", "type": "string", "optional": True}
                ],
                "optional": False
            },
            "payload": {
                "timestamp": timestamp,
                "error": error_message,
                "query": original_query
            }
        }

        # Send to client error_log topic
        await error_topic.send(value=error_record)

        logger.info(f"🐞 Logged SQL error to '{error_topic_name}': {error_message}")

        duration = time.time() - start
        messages_processed.labels(flow="errors").inc()
        processing_time.labels(flow="errors").set(duration)


# Mongo Agent
@app.agent(mongo_topic)
async def process(events):
    """
    Consumes NGSI notifications from the 'raw_mongo' topic and transforms them into MongoDB-compatible documents.
    Encodes Fiware service and service path to match MongoDB naming restrictions.
    Each message is enriched with reception timestamp and entity metadata before being published to the output topic.
    """
    async for raw in events:
        start = time.time()
        try:
            data = json.loads(raw)

            headers = data.get("headers", {})
            body = data.get("body", {})
            attributes = body.get("attributes", [])

            fiware_service = headers.get("fiware-service", "default")
            service_path = headers.get("fiware-servicepath", "/")

            # Encode database and collection
            mongo_db = f"sth_{encode_mongo(fiware_service)}"
            mongo_collection = f"sth_{encode_mongo(service_path)}"

            timestamp = int(headers.get("timestamp", datetime.now().timestamp()))
            recv_time_ts = str(timestamp * 1000)
            recv_time = datetime.utcfromtimestamp(timestamp).replace(tzinfo=timezone.utc).isoformat()

            # Document to be inserted
            doc = {
                "recvTimeTs": recv_time_ts,
                "recvTime": recv_time,
                "entityId": body.get("entityId"),
                "entityType": body.get("entityType")
            }

            for attr in attributes:
                name = attr.get("attrName")
                value = attr.get("attrValue")
                doc[name] = value

            # Send to Kafka with key for routing
            await mongo_output_topic.send(
                key=json.dumps({
                    "database": mongo_db,
                    "collection": mongo_collection
                }),
                value=json.dumps(doc)
            )

            logger.info(f"✅ [mongo] Sent document to topic 'tests_mongo' | DB: {mongo_db}, Collection: {mongo_collection}")

        except Exception as e:
            logger.error(f"❌ [mongo] Error processing event: {e}")
        
        duration = time.time() - start
        messages_processed.labels(flow="mongo").inc()
        processing_time.labels(flow="mongo").set(duration)