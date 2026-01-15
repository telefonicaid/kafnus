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
const { getFiwareContext } = require('../utils/handleEntityCb');
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
                    producer.produce(
                        outputTopic,
                        null, // partition null: kafka decides
                        Buffer.from(JSON.stringify(mutation)), // message
                        null, // Key (optional)
                        Date.now(), // timestamp
                        null, // Opaque
                        outHeaders
                    );
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
