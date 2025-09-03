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
const { buildTargetTable, getFiwareContext, handleEntityCb } = require('../utils/handleEntityCb');
const { buildKafkaKey } = require('../utils/ngsiUtils');
const { messagesProcessed, processingTime } = require('../utils/metrics');

async function startLastdataConsumerAgent(logger) {
    const topic = 'raw_lastdata';
    const groupId = /*process.env.GROUP_ID ||*/ 'ngsi-processor-lastdata';
    const datamodel = 'dm-by-entity-type-database';
    const suffix = '_lastdata';

    const producer = await createProducer(logger);

    const consumer = await createConsumerAgent(logger, {
        groupId,
        topic,
        onData: async ({ key, value, headers }) => {
            const start = Date.now();
            const k = key ? key.toString() : null;
            const rawValue = value ? value.toString() : null;
            logger.info(`[lastdata] key=${k} value=${rawValue}`);

            try {
                //logger.info(`rawValue: '${rawValue}'`);
                const message = JSON.parse(rawValue);
                //logger.info(`message: '${message}'`);
                const payload = message.payload;
                const dataList = payload.data ? payload.data : [];
                //logger.info('entities: %j', entities);
                if (dataList && dataList.length === 0) {
                    logger.warn('[lastdata] No data found in payload');
                    return;
                }
                const { service, servicepath } = getFiwareContext(headers, payload);

                const entityRaw = dataList[0];
                const entityId = entityRaw.id;
                const entityType = entityRaw.type ? entityRaw.type.toLowerCase() : undefined;
                const alteration = entityRaw.alterationType;
                let alterationType = null;
                if (alteration !== undefined) {
                    alterationType = alteration.value ? alteration.value.toLowerCase() : alteration.toLowerCase();
                } else {
                    alterationType = 'entityupdate';
                }
                if (!entityId) {
                    logger.warn('[lastdata] No entity ID  found');
                    return;
                }
                if (alterationType === 'entitydelete') {
                    // alterationType = deleteEntity only can include one entity in notif
                    const deleteEntity = {
                        entityid: entityId,
                        entitytype: entityType,
                        fiwareservicepath: servicepath
                    };
                    const targetTable = buildTargetTable(datamodel, service, servicepath, entityId, entityType, suffix);
                    const topicName = `${service}${suffix}`;
                    const kafkaKey = buildKafkaKey(deleteEntity, ['entityid'], false);
                    const outHeaders = [{ target_table: Buffer.from(targetTable) }];
                    producer.produce(
                        topicName,
                        null, // partition null: kafka decides
                        null, // message
                        kafkaKey,
                        Date.now(),
                        null, // opaque
                        outHeaders
                    );
                    logger.info(
                        `[${
                            suffix.replace(/^_/, '') || 'lastdata'
                        }] Sent to topic '${topicName}' (table: '${targetTable}'): ${deleteEntity.entityid}`
                    );
                } else {
                    await handleEntityCb(
                        logger,
                        rawValue, // rawValue has all entities, no just first
                        {
                            headers,
                            suffix,
                            includeTimeinstant: false,
                            keyFields: ['entityid'],
                            datamodel
                        },
                        producer
                    );
                }
            } catch (err) {
                logger.error('[lastdata] Error processing event: %j', err);
            }

            const duration = (Date.now() - start) / 1000;
            messagesProcessed.labels({ flow: 'lastdata' }).inc();
            processingTime.labels({ flow: 'lastdata' }).set(duration);
        }
    });

    return consumer;
}

module.exports = startLastdataConsumerAgent;
