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

const { once } = require('events');
const Kafka = require('@confluentinc/kafka-javascript');

async function safeProduce(producer, args, { maxWaitMs = 30000 } = {}) {
    const deadline = Date.now() + maxWaitMs;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            producer.produce(...args);
            return;
        } catch (err) {
            if (err?.code !== Kafka.CODES.ERRORS.ERR__QUEUE_FULL) {
                throw err;
            }

            // Wait to will be released (delivery-report releases internal queue)
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                throw err;
            }

            await Promise.race([
                once(producer, 'delivery-report'),
                new Promise((_, rej) => setTimeout(() => rej(err), Math.min(1000, remaining)))
            ]);
            // retry
        }
    }
}

// ================= PARSE =================

function parseJson(raw) {
    return JSON.parse(raw);
}

// ================= CONTEXT =================

function buildContext(headers, message) {
    const { service, servicepath, datamodel } = getFiwareContext(headers, message);

    return { service, servicepath, datamodel };
}

function buildTopicName(service, suffix) {
    return config.ngsi.prefix + `${service}${suffix}`;
}

// ================= ENTITY =================

function buildBaseEntity(entity, context) {
    return {
        entityid: entity.id,
        entitytype: entity.type,
        fiwareservicepath: context.servicepath
    };
}

// ================= GEO =================

function handleGeo(name, value, attrType, attributes, schemaOverrides, attributesTypes) {
    if (!attrType.startsWith('geo:')) return false;

    const wkt = toWktGeometry(attrType, value);
    if (!wkt) {
        return false;
    }

    const wkb = toWkbStructFromWkt(wkt, name);
    if (!wkb) {
        return false;
    }

    attributes[name] = wkb.payload;
    schemaOverrides[name] = wkb.schema;
    attributesTypes[name] = attrType;

    return true;
}

// ================= ATTRIBUTES =================

function isIgnoredAttr(name) {
    return ['id', 'type', 'alterationtype'].includes(name);
}

function processAttribute(name, attrData, attributes, schemaOverrides, attributesTypes) {
    let value = attrData?.value;
    const attrType = attrData?.type || '';

    if (handleGeo(name, value, attrType, attributes, schemaOverrides, attributesTypes)) {
        return;
    }

    value = normalizeValue(value, attrType);

    attributes[name] = value;
    attributesTypes[name] = attrType;
}

function extractAttributes(entity) {
    const attributes = {};
    const schemaOverrides = {};
    const attributesTypes = {};

    const entries = Object.entries(entity).sort();

    for (const [rawName, attrData] of entries) {
        const attrName = rawName.toLowerCase();

        if (isIgnoredAttr(attrName)) {
            continue;
        }

        processAttribute(attrName, attrData, attributes, schemaOverrides, attributesTypes);
    }

    return { attributes, schemaOverrides, attributesTypes };
}

// ================= VALUE =================

function normalizeValue(value, type) {
    if (['json', 'jsonb'].includes(type)) {
        return JSON.stringify(value);
    }
    return value;
}

// ================= HEADERS =================

function buildHeaders({ context, entity, flowSuffix }) {
    return [
        { 'fiware-service': Buffer.from(sanitizeString(context.service)) },
        { 'fiware-servicepath': Buffer.from(sanitizeString(context.servicepath)) },
        { 'fiware-datamodel': Buffer.from(context.datamodel || '') },
        { entityType: Buffer.from(sanitizeString(entity.type)) },
        { entityId: Buffer.from(sanitizeString(entity.id)) },
        {
            suffix: Buffer.from(flowSuffix === '_historic' ? '' : sanitizeString(flowSuffix))
        }
    ];
}

// ================= PRODUCE =================

async function publishEntity(producer, topic, message, key, headers) {
    await safeProduce(producer, [topic, null, Buffer.from(JSON.stringify(message)), key, Date.now(), null, headers]);
}

// ================= LOG =================

function logEntitySent(logger, topic, headers, entityId, flowSuffix) {
    const suffixLabel = (flowSuffix ?? '').replace(/^_/, '') || 'historic';

    const readableHeaders = headers.map((h) =>
        Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.toString()]))
    );

    logger.info(
        `[${suffixLabel}] Sent to '${topic}', headers: ${JSON.stringify(readableHeaders)}, entityid: ${entityId}`
    );
}

// ================= ERROR =================

function handleError(err, logger) {
    if (err?.code === Kafka.CODES.ERRORS.ERR__QUEUE_FULL) {
        throw err;
    }

    logger.error(`Error in handleEntityCb: ${err?.stack || err}`);
    throw err;
}

// ================= PROCESS =================

async function processEntity({
    entity,
    context,
    topicName,
    flowSuffix,
    includeTimeinstant,
    keyFields,
    producer,
    logger
}) {
    const base = buildBaseEntity(entity, context);
    const { attributes, schemaOverrides, attributesTypes } = extractAttributes(entity);

    const fullEntity = { ...base, ...attributes };

    const kafkaMessage = toKafnusConnectSchema(fullEntity, schemaOverrides, attributesTypes);

    const kafkaKey = buildKafkaKey(fullEntity, keyFields, includeTimeinstant);

    const headersOut = buildHeaders({
        context,
        entity,
        flowSuffix
    });

    await publishEntity(producer, topicName, kafkaMessage, kafkaKey, headersOut);

    logEntitySent(logger, topicName, headersOut, fullEntity.entityid, flowSuffix);
}

// ================= PROCESS =================

async function handleEntityCb(
    logger,
    rawValue,
    { headers = [], suffix = '', flowSuffix = '_historic', includeTimeinstant = true, keyFields = ['entityid'] } = {},
    producer
) {
    try {
        const message = parseJson(rawValue);
        const entities = message.data || [];

        if (!entities.length) {
            logger.warn('No entities found in payload');
            return;
        }

        const context = buildContext(headers, message);
        const topicName = buildTopicName(context.service, suffix);

        for (const entity of entities) {
            await processEntity({
                entity,
                context,
                topicName,
                flowSuffix,
                includeTimeinstant,
                keyFields,
                producer,
                logger
            });
        }
    } catch (err) {
        handleError(err, logger);
    }
}

module.exports.handleEntityCb = handleEntityCb;
module.exports.safeProduce = safeProduce;
