/*
 * Copyright 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
 *
 * This file is part of kafnus
 *
 * kafnus is free software: you can redistribute it and/or
 * modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * kafnus is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with kafnus. If not, see http://www.gnu.org/licenses/.
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

async function safeProduce(producer, args) {
    try {
        producer.produce(...args);
    } catch (err) {
        if (err.code === Kafka.CODES.ERRORS.QUEUE_FULL) {
            // Without logs to avoid duplicates
            throw err; // raise backpressure
        }
        throw err;
    }
}

async function handleEntityCb(
    logger,
    rawValue,
    { headers = [], suffix = '', flowSuffix = '_historic', includeTimeinstant = true, keyFields = ['entityid'] } = {},
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
                { entityType: Buffer.from(sanitizeString(entityType)) },
                { entityId: Buffer.from(sanitizeString(entityId)) },
                { suffix: Buffer.from(flowSuffix === '_historic' ? '' : sanitizeString(flowSuffix)) }
            ];

            await safeProduce(producer, [
                topicName,
                null,
                Buffer.from(JSON.stringify(kafkaMessage)),
                kafkaKey,
                Date.now(),
                null,
                headersOut
            ]);

            logger.info(
                `[${
                    (suffix ?? flowSuffix).replace(/^_/, '') || 'historic'
                }] Sent to topic '${topicName}', headers: ${JSON.stringify(
                    headersOut.map((h) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.toString()])))
                )}, entityid: ${entity.entityid}`
            );
        }
    } catch (err) {
        if (err?.code === Kafka.CODES.ERRORS.QUEUE_FULL) {
            throw err; // allow consumer pause
        }
        logger.error(`Error in handleEntityCb: ${err?.stack || err}`);
        throw err;
    }
}

module.exports.handleEntityCb = handleEntityCb;
module.exports.safeProduce = safeProduce;
