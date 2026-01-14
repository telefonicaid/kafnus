/*
 * Copyright 2025 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
 * PROJECT: Kafnus
 *
 * This software and / or computer program has been developed by Telefónica Soluciones
 * de Informática y Comunicaciones de España, S.A.U (hereinafter TSOL) and is protected
 * as copyright by the applicable legislation on intellectual property.
 *
 * It belongs to TSOL, and / or its licensors, the exclusive rights of reproduction,
 * distribution, public communication and transformation, and any economic right on it,
 * all without prejudice of the moral rights of the authors mentioned above. It is expressly
 * forbidden to decompile, disassemble, reverse engineer, sublicense or otherwise transmit
 * by any means, translate or create derivative works of the software and / or computer
 * programs, and perform with respect to all or part of such programs, any type of exploitation.
 *
 * Any use of all or part of the software and / or computer program will require the
 * express written consent of TSOL. In all cases, it will be necessary to make
 * an express reference to TSOL ownership in the software and / or computer
 * program.
 *
 * Non-fulfillment of the provisions set forth herein and, in general, any violation of
 * the peaceful possession and ownership of these rights will be prosecuted by the means
 * provided in both Spanish and international law. TSOL reserves any civil or
 * criminal actions it may exercise to protect its rights.
 */

const {
    toWktGeometry,
    toWkbStructFromWkt,
    toKafnusConnectSchema,
    buildKafkaKey,
    sanitizeString,
    getFiwareContext
} = require('./ngsiUtils');
const { config } = require('../../kafnusConfig');

const Kafka = require('@confluentinc/kafka-javascript');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeProduce(producer, args, logger) {
    while (true) {
        try {
            producer.produce(...args);
            return;
        } catch (err) {
            if (err.code === Kafka.CODES.ERRORS.QUEUE_FULL) {
                logger.warn('[producer] Queue full — waiting...');
                await sleep(50);
            } else {
                throw err;
            }
        }
    }
}

async function handleEntityCb(
    logger,
    rawValue,
    {
        headers = [],
        datamodel = 'dm-by-entity-type-database',
        suffix = '',
        flowSuffix = '_historic',
        includeTimeinstant = true,
        keyFields = ['entityid']
    } = {},
    producer
) {
    try {
        const message = JSON.parse(rawValue);
        const entities = message.data || [];

        if (!entities.length) {
            logger.warn('No entities found in payload');
            return;
        }

        const { service, servicepath } = getFiwareContext(headers, message);

        for (const ngsiEntity of entities) {
            const entityId = ngsiEntity.id;
            const entityType = ngsiEntity.type;

            const topicName = config.ngsi.prefix + `${service}${suffix}`;

            let entity = {
                entityid: entityId,
                entitytype: entityType,
                fiwareservicepath: servicepath
            };

            const attributes = {};
            const schemaOverrides = {};
            const attributesTypes = {};

            for (const [attrNameRaw, attrData] of Object.entries(ngsiEntity).sort()) {
                const attrName = attrNameRaw.toLowerCase();
                if (['id', 'type', 'alterationtype'].includes(attrName)) {
                    continue;
                }

                let value = attrData?.value;
                const attrType = attrData?.type || '';

                if (attrType.startsWith('geo:')) {
                    const wkt = toWktGeometry(attrType, value);
                    if (wkt) {
                        const wkb = toWkbStructFromWkt(wkt, attrName);
                        if (wkb) {
                            attributes[attrName] = wkb.payload;
                            schemaOverrides[attrName] = wkb.schema;
                            attributesTypes[attrName] = attrType;
                            continue;
                        }
                    }
                }

                if (['json', 'jsonb'].includes(attrType)) {
                    value = JSON.stringify(value);
                }

                attributes[attrName] = value;
                attributesTypes[attrName] = attrType;
            }

            entity = { ...entity, ...attributes };

            const kafkaMessage = toKafnusConnectSchema(entity, schemaOverrides, attributesTypes);
            const kafkaKey = buildKafkaKey(entity, keyFields, includeTimeinstant);

            // === Headers for Header Router ===
            const headersOut = [
                { 'fiware-service': Buffer.from(sanitizeString(service)) },
                { 'fiware-servicepath': Buffer.from(sanitizeString(servicepath)) },
                { 'entityType': Buffer.from(sanitizeString(entityType)) },
                { 'entityId': Buffer.from(sanitizeString(entityId)) },
                { 'suffix': Buffer.from(flowSuffix === '_historic' ? '' : sanitizeString(flowSuffix)) }
            ];

            await safeProduce(
                producer,
                [topicName, null, Buffer.from(JSON.stringify(kafkaMessage)), kafkaKey, Date.now(), null, headersOut],
                logger
            );

            logger.info(
                `[${(suffix ?? flowSuffix).replace(/^_/, '') || 'historic'}] Sent to topic '${topicName}', headers: ${JSON.stringify(
                    headersOut.map(h => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.toString()])))
                )}, entityid: ${entity.entityid}`
            );
        }
    } catch (err) {
        logger.error(`Error in handleEntityCb: ${err}`);
    }
}

module.exports.handleEntityCb = handleEntityCb;
module.exports.getFiwareContext = getFiwareContext;
module.exports.safeProduce = safeProduce;
