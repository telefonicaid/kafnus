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
from app.kafka_utils import to_kafnus_connect_schema, build_kafka_key
from app.types_utils import sanitize_topic, to_wkb_struct_from_wkt, to_wkt_geometry

import logging
logger = logging.getLogger(__name__)

def build_target_table(datamodel, service, servicepath, entityid, entitytype, suffix):
    """
    Determines the name of the target table based on the chosen datamodel and NGSI metadata 
    (service, service path, entity ID, entity type). It could be study to move this logic to
    custom SMT.
    """
    if datamodel == "dm-by-entity-type-database":
        return sanitize_topic(f"{servicepath}_{entitytype}{suffix}")
    elif datamodel == "dm-by-fixed-entity-type-database-schema":
        return sanitize_topic(f"{entitytype}{suffix}")
    else:
        raise ValueError(f"Unsupported datamodel: {datamodel}")

async def handle_entity_cb(app, raw_value, headers=None, datamodel="dm-by-entity-type-database", suffix="", include_timeinstant=True, key_fields=None):
    """
    Consumes NGSI notifications coming via FIWARE Context Broker, processes and transforms them into Kafnus Connect format.
    Assumes raw_value is a JSON string with a payload field containing another JSON string with 'data' array.
    """
    event = json.loads(raw_value)
    payload_str = event.get("payload")
    if not payload_str:
        logger.warning("⚠️ No payload found in message")
        return

    try:
        payload = json.loads(payload_str)
    except Exception as e:
        logger.error(f"❌ Error parsing payload: {e}")
        return

    if headers:
        header_dict = {k: v.decode() for k, v in headers}
        service = header_dict.get("fiware-service", "default").lower()
        servicepath = header_dict.get("fiware-servicepath", "/").lower()
        if not servicepath.startswith("/"):
            servicepath = "/" + servicepath

    else:
        service = event.get("fiware-service", "default").lower()
        servicepath = event.get("fiware-servicepath", "/").lower()
        if not servicepath.startswith("/"):
            servicepath = "/" + servicepath

    #logger.info("HEADERS (service+servicepath):")
    #logger.info(service)
    #logger.info(servicepath)

    for entity_raw in payload.get("data", []):
        entity_id = entity_raw.get("id", "unknown")
        entity_type = entity_raw.get("type", "unknown")

        #logger.info("ENTIDAD (id+type)")
        #logger.info(entity_id)
        #logger.info(entity_type)

        target_table = build_target_table(datamodel, service, servicepath, entity_id, entity_type, suffix)
        topic_name = f"{service}{suffix}"
        output_topic = app.topic(topic_name)

        entity = {
            "entityid": entity_id,
            "entitytype": entity_type,
            "fiwareservicepath": servicepath
        }

        attributes = {}
        schema_overrides = {}

        for attr_name, attr_data in sorted(entity_raw.items()):
            attr_name = attr_name.lower()
            if attr_name in ["id", "type"]:
                continue

            value = attr_data.get("value")
            attr_type = attr_data.get("type", "")

            if attr_type.startswith("geo:"):
                wkt_str = to_wkt_geometry(attr_type, value)
                if wkt_str:
                    wkb_struct = to_wkb_struct_from_wkt(wkt_str, attr_name)
                    if wkb_struct:
                        attributes[attr_name] = wkb_struct["payload"]
                        schema_overrides[attr_name] = wkb_struct["schema"]
                        continue
            elif attr_type in ["json", "jsonb"]:
                try:
                    value = json.dumps(value, ensure_ascii=False)
                except Exception as e:
                    logger.warning(f"⚠️ Error serializing field '{attr_name}' as JSON string: {e}")
                    value = str(value)

            attributes[attr_name] = value

        entity.update(attributes)

        if key_fields is None:
            key_fields = ["entityid"]

        kafka_message = to_kafnus_connect_schema(entity, schema_overrides)
        kafka_key = build_kafka_key(entity, key_fields=key_fields, include_timeinstant=include_timeinstant)

        await output_topic.send(
            key=kafka_key,
            value=json.dumps(kafka_message).encode("utf-8"),
            headers=[("target_table", target_table.encode())]
        )

        logger.info(f"✅ [{suffix.lstrip('_') or 'historic'}] Sent to topic '{topic_name}' (table: '{target_table}'): {entity.get('entityid')}")

