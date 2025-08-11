const { Kafka } = require('@confluentinc/kafka-javascript').KafkaJS;
const { baseConfig } = require('../../kafnusConfig');
const { info, warn, error } = require('./logger');
const {
  toWktGeometry,
  toWkbStructFromWkt,
  toKafnusConnectSchema,
  buildKafkaKey,
  sanitizeTopic
} = require('./ngsiUtils'); // debes implementar estas funciones


function buildTargetTable(datamodel, service, servicepath, entityid, entitytype, suffix) {
  /**
   * Determines the name of the target table based on the chosen datamodel and NGSI metadata 
   * (service, service path, entity ID, entity type).
   * It could be studied to move this logic to a custom SMT.
   */
  if (datamodel === 'dm-by-entity-type-database') {
    return sanitizeTopic(`${servicepath}_${entitytype}${suffix}`);
  } else if (datamodel === 'dm-by-fixed-entity-type-database-schema') {
    return sanitizeTopic(`${entitytype}${suffix}`);
  } else {
    throw new Error(`Unsupported datamodel: ${datamodel}`);
  }
}

function getFiwareContext(headers, fallbackEvent) {
  if (headers && headers.length > 0) {
    const hdict = {};
    headers.forEach(([k, v]) => {
      hdict[k] = v.toString();
    });
    var service = (hdict['fiware-service'] || 'default').toLowerCase();
    var servicepath = (hdict['fiware-servicepath'] || '/').toLowerCase();
  } else {
    var service = (fallbackEvent['fiware-service'] || 'default').toLowerCase();
    var servicepath = (fallbackEvent['fiware-servicepath'] || '/').toLowerCase();
  }
  if (!servicepath.startsWith('/')) {
    servicepath = '/' + servicepath;
  }
  return { service, servicepath };
}

async function handleEntityCb(
  rawValue,
  { headers = [], datamodel = 'dm-by-entity-type-database', suffix = '', includeTimeinstant = true, keyFields = null } = {}
) {
  try {
    //info(`rawValue: '${rawValue}'`);
    const message = JSON.parse(rawValue);
    //info(`message: '${message}'`);
    const payloadStr = message.payload;
    //info(`payloadStr: '${payloadStr}'`);
    if (!payloadStr) {
      warn('No payload found in message');
      return;
    }
    const payload = JSON.parse(payloadStr);
    const entities = payload.data || [];
    if (entities.length === 0) {
      warn('No entities found in payload');
      return;
    }
    const { service, servicepath } = getFiwareContext(headers, message);

    for (const ngsiEntity of entities) {
      const entityId = ngsiEntity.id || 'unknown';
      const entityType = ngsiEntity.type || 'unknown';

      const targetTable = buildTargetTable(datamodel, service, servicepath, entityId, entityType, suffix);
      const topicName = `${service}${suffix}`;
      const outputTopic = topicName;

      const entity = {
        entityid: entityId,
        entitytype: entityType,
        fiwareservicepath: servicepath
      };

      const attributes = {};
      const schemaOverrides = {};
      const attributesTypes = {};

      for (const [attrNameRaw, attrData] of Object.entries(ngsiEntity).sort()) {
        let attrName = attrNameRaw.toLowerCase();
        if (['id', 'type', 'alterationtype', 'fiware-service', 'fiware-servicepath'].includes(attrName)) {
          continue;
        }

        let value = attrData?.value;
        const attrType = attrData?.type || '';

        if (attrType.startsWith('geo:')) {
          const wktStr = toWktGeometry(attrType, value);
          if (wktStr) {
            const wkbStruct = toWkbStructFromWkt(wktStr, attrName);
            if (wkbStruct) {
              attributes[attrName] = wkbStruct.payload;
              attributesTypes[attrName] = attrType;
              schemaOverrides[attrName] = wkbStruct.schema;
              continue;
            }
          }
        } else if (['json', 'jsonb'].includes(attrType)) {
          try {
            value = JSON.stringify(value);
          } catch (err) {
            warn(`Error serializing field '${attrName}' as JSON: ${err}`);
            value = String(value);
          }
        }

        attributes[attrName] = value;
        attributesTypes[attrName] = attrType;
      }

      entity.push = { ...entity, ...attributes };
      if (!keyFields) keyFields = ['entityid'];
      const kafkaMessage = toKafnusConnectSchema(entity, schemaOverrides, attributesTypes);
      const kafkaKey = buildKafkaKey(entity, keyFields, includeTimeinstant );

      const producer = new Kafka().producer(baseConfig);
      await producer.connect();
      const res = []
      res.push(producer.send({
            topic: topicName,
            messages: [
                { value: Buffer.from(JSON.stringify(kafkaMessage)),
                  partition: 0,
                  key: kafkaKey },
            ]
      }));
      await Promise.all(res);
        
      info(`[${suffix.replace(/^_/, '') || 'historic'}] Sent to topic '${topicName}' (table: '${targetTable}'): ${entity.entityid}`);
    }
  } catch (err) {
    error(`Error in handleEntityCb: ${err}`);
  }
}

module.exports = handleEntityCb;
