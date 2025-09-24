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
const { createProducer } = require('./sharedProducerFactory');
const { getFiwareContext, encodeMongo } = require('../utils/ngsiUtils');
const { DateTime } = require('luxon');
const { messagesProcessed, processingTime } = require('../utils/metrics');

const OUTPUT_TOPIC_SUFFIX = '_mongo';

async function startMongoConsumerAgent(logger) {
    const topic = 'raw_mongo';
    const outputTopic = 'test_mongo';
    const groupId = /* process.env.GROUP_ID || */ 'ngsi-processor-mongo';

    const producer = await createProducer(logger);

    const consumer = await createConsumerAgent(logger, {
        groupId,
        topic,
        onData: ({ key, value, headers }) => {
            const start = Date.now();
            try {
                const rawValue = value ? value.toString() : null;
                if (!rawValue) return;

                const k = key ? key.toString() : null;
                logger.info(`[mongo] key=${k} value=${rawValue}`);

                const message = JSON.parse(rawValue);

                // Extract Fiware-Service and Fiware-ServicePath from headers (for routing)
                const { service: fiwareService, servicepath: servicePath } =
                    getFiwareContext(headers, message);

                // Encode database and collection
                const mongoDb = `sth_${encodeMongo(fiwareService)}`;
                const mongoCollection = `sth_${encodeMongo(servicePath)}`;

                // Define output topic
                const outputTopic = `${fiwareService}${OUTPUT_TOPIC_SUFFIX}`;

                const timestamp = Math.floor(Date.now() / 1000);
                const recvTime = DateTime.fromSeconds(timestamp, { zone: 'utc' }).toISO();

                const entities = message.data || [];
                for (const entity of entities) {
                    const doc = {
                        recvTime,
                        entityId: entity.id,
                        entityType: entity.type
                    };

                    // Add plain attributes
                    for (const [attrName, attrObj] of Object.entries(entity)) {
                        if (attrName !== 'id' && attrName !== 'type') {
                            doc[attrName] = attrObj.value;
                            if (attrObj.metadata && Object.keys(attrObj.metadata).length > 0) {
                                doc[`${attrName}_md`] = attrObj.metadata;
                            }
                        }
                    }

                    logger.info(`[mongo] topic=${topic} | database=${mongoDb} | collection=${mongoCollection} | doc=${JSON.stringify(doc)}`);

                    // Send to outputTopic
                    producer.produce(
                        outputTopic,
                        null, // partition
                        Buffer.from(JSON.stringify(doc)),
                        Buffer.from(JSON.stringify({ database: mongoDb, collection: mongoCollection })),
                        Date.now()
                    );

                    logger.info(`[mongo] Sent to '${outputTopic}' | DB: ${mongoDb}, Collection: ${mongoCollection}`);
                }

            } catch (err) {
                logger.error(`[mongo] Error processing event: ${err.message}`);
            }

            const duration = (Date.now() - start) / 1000;
            messagesProcessed.labels({ flow: 'mongo' }).inc();
            processingTime.labels({ flow: 'mongo' }).set(duration);
        }
    });

    return consumer;
}

module.exports = startMongoConsumerAgent;
