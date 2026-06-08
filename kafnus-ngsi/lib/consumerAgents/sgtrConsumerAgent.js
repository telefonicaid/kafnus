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
const logger = require('../utils/logger');
const { config } = require('../../kafnusConfig');
const Kafka = require('@confluentinc/kafka-javascript');

async function startSgtrConsumerAgent(log, producer) {
    const topic = config.ngsi.prefix + 'raw_sgtr';
    let outputTopic;
    const groupId = 'ngsi-processor-sgtr';

    const consumer = await createConsumerAgent(log, {
        groupId,
        topic,
        producer,
        onData: async (msg) => {
            const start = Date.now();
            let processingResult = 'success';
            let fiwareService = 'default';
            let graphName = null;
            const k = msg.key?.toString() || '';
            const rawValue = msg.value?.toString() || '';

            log.info(`[sgtr] key=${k} value=${rawValue}`);

            try {
                let message;
                try {
                    message = JSON.parse(rawValue);
                } catch (e) {
                    log.warn('[sgtr] Invalid JSON, committing: %s', e.message);
                    consumer.commitMessage(msg);
                    return;
                }
                log.info('[sgtr] message: %j', message);
                const fiwareContext = getFiwareContext(msg.headers, message);
                fiwareService = fiwareContext.service;
                graphName = fiwareContext.graphname;
                log.info(
                    '[sgtr] fiware-service: %j graphname: %j correlator: %j',
                    fiwareService,
                    graphName,
                    fiwareContext.correlator
                );
                const configContext = {
                    op: 'sgtrConsumer',
                    corr: fiwareContext.correlator,
                    service: fiwareContext.service,
                    subservice: fiwareContext.servicepath
                };
                const currentlog = logger.createChildLogger(configContext);
                // fallback for backward compatibility
                if (graphName == null && config.graphql.fallbackGraphName) {
                    currentlog.info(
                        '[sgtr] no graphname header found then fallback to fiware-service: %j ',
                        fiwareService
                    );
                    graphName = fiwareService;
                }

                const dataList = message.data ? message.data : [];

                for (const entityObject of dataList) {
                    currentlog.debug('[sgtr] entityObject:\n%s', JSON.stringify(entityObject, null, 2));

                    const type = entityObject.type;
                    delete entityObject.type;

                    let mutation;
                    const alterationType = entityObject.alterationType?.value
                        ? entityObject.alterationType.value.toLowerCase()
                        : entityObject.alterationType.toLowerCase();

                    delete entityObject.alterationType;

                    if (typeof type === 'string' && type.toLowerCase() === 'location') {
                        transformSgtrGeoJsonToWkt(entityObject);
                    }

                    if (alterationType === 'entityupdate' || alterationType === 'entitychange') {
                        const id = config.graphql.slugUri ? slugify(entityObject.externalId) : entityObject.externalId;
                        mutation = buildMutationUpdate(graphName, type, id, entityObject);
                    } else if (alterationType === 'entitydelete') {
                        const id = config.graphql.slugUri ? slugify(entityObject.externalId) : entityObject.externalId;
                        mutation = buildMutationDelete(graphName, id);
                    } else {
                        if (entityObject.externalId && config.graphql.slugUri) {
                            entityObject.externalId = slugify(entityObject.externalId);
                        }
                        mutation = buildMutationCreate(graphName, type, entityObject);
                    }
                    currentlog.debug('[sgtr] mutation: \n%s', mutation);
                    if (config.graphql.outputTopicByService) {
                        outputTopic = config.ngsi.prefix + fiwareService + '_sgtr_http' + config.ngsi.suffix;
                    } else {
                        outputTopic = config.ngsi.prefix + 'sgtr_http' + config.ngsi.suffix;
                    }
                    const outHeaders = [];
                    // Publish in output topic
                    await safeProduce(producer, [
                        outputTopic,
                        null, // partition null: kafka decides
                        Buffer.from(JSON.stringify(mutation)), // message
                        null, // Key (optional)
                        Date.now(), // timestamp
                        null, // Opaque
                        outHeaders
                    ]);
                    currentlog.info('[sgtr] Sent to %j | mutation %j', outputTopic, mutation);
                } // for loop
                consumer.commitMessage(msg);
            } catch (err) {
                processingResult = 'error';
                if (err?.code === Kafka.CODES.ERRORS.ERR__QUEUE_FULL) {
                    // No Log, rethrow to createConsumerAgent pause
                    throw err;
                }
                currentlog.error(`[sgtr] Error processing event: ${err?.stack || err}, offset NOT committed`);
                // Policy decision:
                // - if no retries, then commit here (to avoid infinite loop)
                // consumer.commitMessage(msg);
                // - if yes retries, do not commit and do not rethrow to avoid upper layer handle this as backpressure
            } finally {
                const duration = (Date.now() - start) / 1000;
                recordFlowProcessing('sgtr', fiwareService, duration, processingResult);
            }
        }
    });

    return consumer;
}

module.exports = startSgtrConsumerAgent;
