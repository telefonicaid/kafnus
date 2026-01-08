/*
 * Copyright 2025 Telefonica Soluciones de Informatica y Comunicaciones de Espa�a, S.A.U.
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

const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { getFiwareContext, encodeMongo } = require('../utils/ngsiUtils');
const { DateTime } = require('luxon');
const { messagesProcessed, processingTime } = require('../utils/admin');
const { config } = require('../../kafnusConfig');

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

                const message = JSON.parse(rawValue);

                const { service: fiwareService, servicepath: servicePath } = getFiwareContext(msg.headers, message);

                const mongoDb = `sth_${encodeMongo(fiwareService)}`;
                const mongoCollection = `sth_${encodeMongo(servicePath)}`;
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

                    producer.produce(
                        outputTopic,
                        null,
                        Buffer.from(JSON.stringify(doc)),
                        Buffer.from(
                            JSON.stringify({
                                database: mongoDb,
                                collection: mongoCollection
                            })
                        ),
                        Date.now()
                    );

                    logger.info(`[mongo] Sent to '${outputTopic}' | DB=${mongoDb} | Collection=${mongoCollection}`);
                }

                consumer.commitMessage(msg);
            } catch (err) {
                logger.error('[mongo] Error processing event, offset NOT committed', err);
            }

            const duration = (Date.now() - start) / 1000;
            messagesProcessed.labels({ flow: 'mongo' }).inc();
            processingTime.labels({ flow: 'mongo' }).set(duration);
        }
    });

    return consumer;
}

module.exports = startMongoConsumerAgent;
