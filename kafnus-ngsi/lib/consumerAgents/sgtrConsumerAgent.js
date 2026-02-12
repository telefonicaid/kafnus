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
const { getFiwareContext } = require('../utils/ngsiUtils');
const { safeProduce } = require('../utils/handleEntityCb');
const { DateTime } = require('luxon');
const { messagesProcessed, processingTime } = require('../utils/admin');
const { slugify, buildMutationCreate, buildMutationUpdate, buildMutationDelete } = require('../utils/graphqlUtils');
const { config } = require('../../kafnusConfig');

async function startSgtrConsumerAgent(logger, producer) {
    const topic = config.ngsi.prefix + 'raw_sgtr';
    let outputTopic;
    const groupId = 'ngsi-processor-sgtr';

    const consumer = await createConsumerAgent(logger, {
        groupId,
        topic,
        producer,
        onData: async ({ key, value, headers }) => {
            const start = Date.now();
            const k = key?.toString() || null;
            const rawValue = value?.toString() || null;

            logger.info(`[sgtr] key=${k} value=${rawValue}`);

            try {
                const message = JSON.parse(rawValue);
                logger.info('[sgtr] message: %j', message);

                const dataList = message.data ? message.data : [];

                for (const entityObject of dataList) {
                    const { service, servicepath } = getFiwareContext(headers, message);
                    const timestamp = headers.timestamp || Math.floor(Date.now() / 1000);
                    const recvTime = DateTime.fromSeconds(timestamp, { zone: 'utc' }).toISO();

                    logger.debug('[sgtr] entityObject:\n%s', JSON.stringify(entityObject, null, 2));

                    const type = entityObject.type;
                    delete entityObject.type;

                    let mutation;
                    const alterationType = entityObject.alterationType?.value
                        ? entityObject.alterationType.value.toLowerCase()
                        : entityObject.alterationType.toLowerCase();

                    delete entityObject.alterationType;

                    if (alterationType === 'entityupdate' || alterationType === 'entitychange') {
                        const id = config.graphql.slugUri ? slugify(entityObject.externalId) : entityObject.externalId;
                        mutation = buildMutationUpdate(service, type, id, entityObject);
                    } else if (alterationType === 'entitydelete') {
                        const id = config.graphql.slugUri ? slugify(entityObject.externalId) : entityObject.externalId;
                        mutation = buildMutationDelete(service, id);
                    } else {
                        if (entityObject.externalId && config.graphql.slugUri) {
                            entityObject.externalId = slugify(entityObject.externalId);
                        }
                        mutation = buildMutationCreate(service, type, entityObject);
                    }
                    logger.debug('[sgtr] mutation: \n%s', mutation);
                    if (config.graphql.outputTopicByService) {
                        outputTopic = config.ngsi.prefix + service + '_' + 'sgtr_http' + config.ngsi.suffix;
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

                    logger.info('[sgtr] Sent to %j | mutation %j', outputTopic, mutation);
                } // for loop
            } catch (err) {
                logger.error('[sgtr] Error processing event, offset NOT committed', err);
            }

            const duration = (Date.now() - start) / 1000;
            messagesProcessed.labels({ flow: 'sgtr' }).inc();
            processingTime.labels({ flow: 'sgtr' }).set(duration);
        }
    });

    return consumer;
}

module.exports = startSgtrConsumerAgent;
