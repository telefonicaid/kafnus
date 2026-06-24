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

const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { sanitizeString, getFiwareContext } = require('../utils/ngsiUtils');
const { safeProduce } = require('../utils/handleEntityCb');
const { DateTime } = require('luxon');
const { recordFlowProcessing } = require('../utils/admin');
const { config } = require('../../kafnusConfig');
const logger = require('../utils/logger');
const Kafka = require('@confluentinc/kafka-javascript');

const OUTPUT_TOPIC_SUFFIX = '_mongo' + config.ngsi.suffix;

// ================= PARSE =================

function parseJson(raw, log, consumer, msg) {
    try {
        return JSON.parse(raw);
    } catch (e) {
        log.warn('[mongo] Invalid JSON: %s', e.message);
        consumer.commitMessage(msg);
        return null;
    }
}

// ================= LOG =================

function logInput(log, msg, rawValue) {
    const k = msg.key?.toString();
    log.info(`[mongo] key=${k} value=${rawValue}`);
}

// ================= CONTEXT =================

function buildContext(msg, message) {
    const ctx = getFiwareContext(msg.headers, message);

    return {
        service: ctx.service,
        servicepath: ctx.servicepath,
        correlator: ctx.correlator
    };
}

function createContextLogger(context) {
    return logger.createChildLogger({
        op: 'mongoConsumer',
        corr: context.correlator,
        service: context.service,
        subservice: context.servicepath
    });
}

// ================= CONFIG =================

function buildMongoConfig(context) {
    return {
        db: context.service,
        collectionPrefix: sanitizeString(`${context.service}${context.servicepath}_`)
    };
}

function buildOutputTopic(service) {
    return `${config.ngsi.prefix}${service}${OUTPUT_TOPIC_SUFFIX}`;
}

// ================= DOCUMENT =================

function buildDocument(entity, recvTime) {
    const doc = {
        recvTime,
        entityId: entity.id,
        entityType: entity.type
    };

    Object.entries(entity).forEach(([key, value]) => {
        if (key === 'id' || key === 'type') {
            return;
        }

        doc[key] = value?.value;

        if (hasMetadata(value)) {
            doc[`${key}_md`] = value.metadata;
        }
    });

    return doc;
}

function hasMetadata(attr) {
    return attr?.metadata && Object.keys(attr.metadata).length > 0;
}

// ================= KAFKA =================

async function publishMongo(producer, topic, doc, db, collection) {
    await safeProduce(producer, [
        topic,
        null,
        Buffer.from(JSON.stringify(doc)),
        Buffer.from(
            JSON.stringify({
                database: db,
                collection
            })
        ),
        Date.now(),
        null,
        null
    ]);
}

// ================= PROCESS =================

async function processMongoEntities({ entities, mongoConfig, outputTopic, producer, currentlog }) {
    const recvTime = DateTime.utc().toISO();

    for (const entity of entities) {
        const doc = buildDocument(entity, recvTime);

        const collection = mongoConfig.collectionPrefix + entity.type;

        await publishMongo(producer, outputTopic, doc, mongoConfig.db, collection);

        currentlog.info(`[mongo] Sent to '${outputTopic}' | DB=${mongoConfig.db} | Collection=${collection}`);
    }
}

// ================= ERROR =================

function handleError(err, log) {
    if (err?.code === Kafka.CODES.ERRORS.ERR__QUEUE_FULL) {
        throw err;
    }

    log?.error(`[mongo] Error processing event: ${err?.stack || err} offset NOT committed`);

    return 'error';
}

// ================= MAIN =================

async function handleMongoMessage(msg, log, producer, consumer) {
    const start = Date.now();
    let processingResult = 'success';
    let fiwareService = 'default';
    let currentlog = log;

    try {
        const rawValue = msg.value?.toString();
        if (!rawValue) {
            consumer.commitMessage(msg);
            return;
        }

        const message = parseJson(rawValue, log, consumer, msg);
        if (!message) {
            return;
        }

        const context = buildContext(msg, message);
        fiwareService = context.service;

        currentlog = createContextLogger(context);
        logInput(log, msg, rawValue);

        const mongoConfig = buildMongoConfig(context);
        const outputTopic = buildOutputTopic(context.service);

        const entities = message.data || [];
        if (entities.length === 0) {
            consumer.commitMessage(msg);
            return;
        }

        await processMongoEntities({
            entities,
            mongoConfig,
            outputTopic,
            producer,
            currentlog
        });

        consumer.commitMessage(msg);
    } catch (err) {
        processingResult = handleError(err, currentlog);
    } finally {
        recordFlowProcessing('mongo', fiwareService, (Date.now() - start) / 1000, processingResult);
    }
}

async function startMongoConsumerAgent(log, producer) {
    const topic = config.ngsi.prefix + 'raw_mongo';
    const groupId = 'ngsi-processor-mongo';

    const consumer = await createConsumerAgent(log, {
        groupId,
        topic,
        producer,
        onData: (msg) => handleMongoMessage(msg, log, producer, consumer)
    });

    return consumer;
}

module.exports = startMongoConsumerAgent;
