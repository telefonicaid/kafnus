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
const { getFiwareContext, transformSgtrGeoJsonToWkt } = require('../utils/ngsiUtils');
const { safeProduce } = require('../utils/handleEntityCb');
const { recordFlowProcessing } = require('../utils/admin');
const { slugify, buildMutationCreate, buildMutationUpdate, buildMutationDelete } = require('../utils/graphqlUtils');
const { config } = require('../../kafnusConfig');
const logger = require('../utils/logger');
const Kafka = require('@confluentinc/kafka-javascript');

// ================= PARSING =================

function parseMessage(rawValue, log, consumer, msg) {
    try {
        return JSON.parse(rawValue);
    } catch (e) {
        log.warn('[sgtr] Invalid JSON: %s', e.message);
        consumer.commitMessage(msg);
        return null;
    }
}

// ================= CONTEXT =================

function buildContext(msg, message) {
    const fiwareContext = getFiwareContext(msg.headers, message);

    return {
        service: fiwareContext.service,
        servicepath: fiwareContext.servicepath,
        correlator: fiwareContext.correlator,
        graphname: fiwareContext.graphname
    };
}

function createContextLogger(context) {
    return logger.createChildLogger({
        op: 'sgtrConsumer',
        corr: context.correlator,
        service: context.service,
        subservice: context.servicepath
    });
}

function logContextInfo(log, context) {
    log.info(
        '[sgtr] fiware-service: %j graphname: %j correlator: %j',
        context.service,
        context.graphname,
        context.correlator
    );
}

function resolveGraphName(context, log) {
    if (context.graphname) {
        return context.graphname;
    }

    if (config.graphql.fallbackGraphName) {
        log.info('[sgtr] fallback graphname to service: %j', context.service);
        return context.service;
    }

    return null;
}

// ================= ENTITY PROCESSING =================

async function processEntities({ message, graphName, outputTopic, producer, currentlog }) {
    const dataList = message.data || [];

    for (const entity of dataList) {
        currentlog.debug('[sgtr] entity:\n%s', JSON.stringify(entity, null, 2));

        const prepared = prepareEntity(entity);
        const mutation = buildMutation(graphName, prepared);

        currentlog.debug('[sgtr] mutation:\n%s', mutation);

        await publishMutation(producer, outputTopic, mutation);

        currentlog.info('[sgtr] Sent to %j', outputTopic);
    }
}

function prepareEntity(entity) {
    const type = entity.type;
    const alterationType = resolveAlterationType(entity.alterationType);

    const cleanEntity = { ...entity };
    delete cleanEntity.type;
    delete cleanEntity.alterationType;

    if (typeof type === 'string' && type.toLowerCase() === 'location') {
        transformSgtrGeoJsonToWkt(cleanEntity);
    }

    normalizeExternalId(cleanEntity);

    return {
        type,
        alterationType,
        entity: cleanEntity
    };
}

function resolveAlterationType(alterationType) {
    return alterationType?.value ? alterationType.value.toLowerCase() : alterationType?.toLowerCase();
}

function normalizeExternalId(entity) {
    if (entity.externalId && config.graphql.slugUri) {
        entity.externalId = slugify(entity.externalId);
    }
}

// ================= MUTATION =================

function buildMutation(graphName, { type, alterationType, entity }) {
    const id = entity.externalId;

    const strategies = {
        entityupdate: () => buildMutationUpdate(graphName, type, id, entity),
        entitychange: () => buildMutationUpdate(graphName, type, id, entity),
        entitydelete: () => buildMutationDelete(graphName, id)
    };

    const handler = strategies[alterationType];

    if (handler) {
        return handler();
    }

    return buildMutationCreate(graphName, type, entity);
}

// ================= KAFKA =================

function resolveOutputTopic(service) {
    return config.graphql.outputTopicByService
        ? `${config.ngsi.prefix}${service}_sgtr_http${config.ngsi.suffix}`
        : `${config.ngsi.prefix}sgtr_http${config.ngsi.suffix}`;
}

async function publishMutation(producer, topic, mutation) {
    await safeProduce(producer, [topic, null, Buffer.from(JSON.stringify(mutation)), null, Date.now(), null, []]);
}

// ================= ERROR HANDLING =================

function handleError(err, log) {
    if (err?.code === Kafka.CODES.ERRORS.ERR__QUEUE_FULL) {
        throw err;
    }

    log?.error(`[sgtr] Error processing event: ${err?.stack || err}`);
    return 'error';
}

// ================= MAIN HANDLER =================

async function handleMessage(msg, log, producer, consumer) {
    const start = Date.now();
    let processingResult = 'success';
    let fiwareService = 'default';
    let currentlog = log;

    try {
        const rawValue = msg.value?.toString() || '';

        const message = parseMessage(rawValue, log, consumer, msg);
        if (!message) {
            return;
        }

        const context = buildContext(msg, message);
        fiwareService = context.service;

        currentlog = createContextLogger(context);
        logContextInfo(currentlog, context);

        const graphName = resolveGraphName(context, currentlog);
        const outputTopic = resolveOutputTopic(context.service);

        await processEntities({
            message,
            graphName,
            outputTopic,
            producer,
            currentlog
        });

        consumer.commitMessage(msg);
    } catch (err) {
        processingResult = handleError(err, currentlog);
    } finally {
        const duration = (Date.now() - start) / 1000;
        recordFlowProcessing('sgtr', fiwareService, duration, processingResult);
    }
}

// ================= SGTR Consumer =================

async function startSgtrConsumerAgent(log, producer) {
    const topic = config.ngsi.prefix + 'raw_sgtr';
    const groupId = 'ngsi-processor-sgtr';

    const consumer = await createConsumerAgent(log, {
        groupId,
        topic,
        producer,
        onData: (msg) => handleMessage(msg, log, producer, consumer)
    });

    return consumer;
}

module.exports = startSgtrConsumerAgent;
