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
const { recordFlowProcessing } = require('../utils/admin');
const { config } = require('../../kafnusConfig');
const { getGrafoName, buildSparqlForEntity } = require('../utils/virtuosoUtils');
const Kafka = require('@confluentinc/kafka-javascript');

async function startVirtuosoConsumerAgent(logger, producer) {
    // TDB: define another raw topic for this consumer
    const topic = config.ngsi.prefix + 'raw_sgtr';
    let outputTopic;
    const groupId = 'ngsi-processor-sgtr-virtuoso';

    const consumer = await createConsumerAgent(logger, {
        groupId,
        topic,
        producer,
        onData: async (msg) => {
            const start = Date.now();
            const k = msg.key?.toString() || '';
            const rawValue = msg.value?.toString() || '';

            logger.info(`[sgtr-virtuoso] key=${k} value=${rawValue}`);

            try {
                let message;
                try {
                    message = JSON.parse(rawValue);
                } catch (e) {
                    logger.warn('[sgtr-virtuoso] Invalid JSON, committing: %s', e.message);
                    consumer.commitMessage(msg);
                    return;
                }

                logger.info('[sgtr-virtuoso] message: %j', message);

                const dataList = Array.isArray(message.data) ? message.data : [];

                for (const entityObjectOriginal of dataList) {
                    const entityObject = JSON.parse(JSON.stringify(entityObjectOriginal));
                    const { service } = getFiwareContext(msg.headers, message);

                    logger.debug('[sgtr-virtuoso] fiware-service:%s', JSON.stringify(service, null, 2));
                    logger.debug('[sgtr-virtuoso] entityObject:\n%s', JSON.stringify(entityObject, null, 2));
                    const graphUri = getGrafoName(service);

                    const sparql = buildSparqlForEntity(graphUri, service, entityObject);

                    logger.debug('[sgtr-virtuoso] sparql:\n%s', sparql);

                    const outHeaders = [{ key: 'content-type', value: Buffer.from('application/sparql-update') }];
                    if (config.graphql.outputTopicByService) {
                        outputTopic = config.ngsi.prefix + service + '_virtuoso_http' + config.ngsi.suffix;
                    } else {
                        outputTopic = config.ngsi.prefix + 'virtuoso_http' + config.ngsi.suffix;
                    }
                    await safeProduce(producer, [
                        outputTopic,
                        null,
                        Buffer.from(sparql),
                        null,
                        Date.now(),
                        null,
                        outHeaders
                    ]);

                    logger.info('[sgtr-virtuoso] Sent to %j | sparql %j', outputTopic, sparql);
                }

                consumer.commitMessage(msg);
            } catch (err) {
                if (err?.code === Kafka.CODES.ERRORS.ERR__QUEUE_FULL) {
                    throw err;
                }

                logger.error(`[sgtr-virtuoso] Error processing event: ${err?.stack || err}, offset NOT committed`);
            } finally {
                const duration = (Date.now() - start) / 1000;
                recordFlowProcessing('sgtr-virtuoso', fiwareService, duration, processingResult);
            }
        }
    });

    return consumer;
}

module.exports = startVirtuosoConsumerAgent;
