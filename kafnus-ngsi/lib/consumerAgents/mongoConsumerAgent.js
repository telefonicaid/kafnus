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
const { getFiwareContext, encodeMongo } = require('../utils/ngsiUtils');
const { safeProduce } = require('../utils/handleEntityCb');
const { DateTime } = require('luxon');
const { messagesProcessed, processingTime } = require('../utils/admin');
const { config } = require('../../kafnusConfig');
const Kafka = require('@confluentinc/kafka-javascript');

const OUTPUT_TOPIC_SUFFIX = '_mongo' + config.ngsi.suffix;

async function startMongoConsumerAgent(logger, producer) {
    const topic = config.ngsi.prefix + 'raw_mongo';
    const groupId = 'ngsi-processor-mongo';

    const consumer = await createConsumerAgent(logger, {
        groupId,
        topic,
        producer,
        onData: async (msg) => {
            const start = Date.now();

            try {
                const rawValue = msg.value?.toString();
                if (!rawValue) {
                    // Nothing to process
                    consumer.commitMessage(msg);
                    return;
                }

                const k = msg.key?.toString();
                logger.info(`[mongo] key=${k} value=${rawValue}`);

                let message;
                try {
                    message = JSON.parse(rawValue);
                } catch (e) {
                    logger.warn('[mongo] Invalid JSON, committing: %s', e.message);
                    consumer.commitMessage(msg);
                    return;
                }

                const { service: fiwareService, servicepath: servicePath } = getFiwareContext(msg.headers, message);

                const mongoDb = `${fiwareService}`;
                const mongoCollection = `${servicePath}`;
                const outputTopic = `${config.ngsi.prefix}${fiwareService}${OUTPUT_TOPIC_SUFFIX}`;

                const recvTime = DateTime.utc().toISO();

                const entities = message.data || [];
                if (entities.length === 0) {
                    // Valid payload but empty
                    consumer.commitMessage(msg);
                    return;
                }

                for (const entity of entities) {
                    const doc = {
                        recvTime,
                        entityId: entity.id,
                        entityType: entity.type
                    };

                    for (const [attrName, attrObj] of Object.entries(entity)) {
                        if (attrName !== 'id' && attrName !== 'type') {
                            doc[attrName] = attrObj?.value;
                            if (attrObj?.metadata && Object.keys(attrObj.metadata).length > 0) {
                                doc[`${attrName}_md`] = attrObj.metadata;
                            }
                        }
                    }

                    await safeProduce(producer, [
                        outputTopic,
                        null, // partition null: kafka decides
                        Buffer.from(JSON.stringify(doc)), // message
                        Buffer.from(
                            JSON.stringify({
                                database: mongoDb,
                                collection: mongoCollection
                            })
                        ), // Key (optional)
                        Date.now(), // timestamp
                        null, // Opaque
                        outHeaders
                    ]);

                    logger.info(`[mongo] Sent to '${outputTopic}' | DB=${mongoDb} | Collection=${mongoCollection}`);
                }

                consumer.commitMessage(msg);
            } catch (err) {
                if (err?.code === Kafka.CODES.ERRORS.QUEUE_FULL) {
                    // No Log, rethrow to createConsumerAgent pause
                    throw err;
                }
                logger.error(`[mongo] Error processing event: ${err?.stack || err} offset NOT committed`);
                // Policy decision:
                // - if no retries, then commit here (to avoid infinite loop)
                // consumer.commitMessage(msg);
                // - if yes retries, do not commit and do not rethrow to avoid upper layer handle this as backpressure
            } finally {
                const duration = (Date.now() - start) / 1000;
                messagesProcessed.labels({ flow: 'mongo' }).inc();
                processingTime.labels({ flow: 'mongo' }).set(duration);
            }
        }
    });

    return consumer;
}

module.exports = startMongoConsumerAgent;
