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
const { handleEntityCb, safeProduce } = require('../utils/handleEntityCb');
const { buildKafkaKey, sanitizeString, getFiwareContext } = require('../utils/ngsiUtils');
const { messagesProcessed, processingTime } = require('../utils/admin');
const { config } = require('../../kafnusConfig');

async function startLastdataConsumerAgent(logger, producer) {
    const topic = config.ngsi.prefix + 'raw_lastdata';
    const groupId = 'ngsi-processor-lastdata';
    const datamodel = 'dm-by-entity-type-database';
    const prefix = config.ngsi.prefix;
    const flowSuffix = '_lastdata';
    const suffix = '_lastdata' + config.ngsi.suffix;

    const consumer = await createConsumerAgent(logger, {
        groupId,
        topic,
        producer,
        onData: async (msg) => {
            const start = Date.now();
            const k = msg.key?.toString() || '';
            const rawValue = msg.value?.toString() || '';
            logger.info(`[lastdata] key=${k} value=${rawValue}`);

            try {
                const message = JSON.parse(rawValue);
                const dataList = message.data ? message.data : [];
                if (dataList && dataList.length === 0) {
                    logger.warn('[lastdata] No data found in payload');
                    consumer.commitMessage(msg);
                    return;
                }
                const { service, servicepath } = getFiwareContext(msg.headers, message);

                const entityRaw = dataList[0];
                const entityId = entityRaw.id;
                const entityType = entityRaw.type?.toLowerCase();
                const alterationType = entityRaw.alterationType?.value?.toLowerCase() ?? 'entityupdate';
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

                    const topicName = `${prefix}${service}${suffix}`;
                    const kafkaKey = buildKafkaKey(deleteEntity, ['entityid'], false);

                    // === Headers for Header Router ===
                    const headersOut = [
                        { 'fiware-service': Buffer.from(sanitizeString(service)) },
                        { 'fiware-servicepath': Buffer.from(sanitizeString(servicepath)) },
                        { 'entityType': Buffer.from(sanitizeString(entityType)) },
                        { 'entityId': Buffer.from(sanitizeString(entityId)) },
                        { 'suffix': Buffer.from(sanitizeString(flowSuffix)) }
                    ];

                    await safeProduce(
                        producer,
                        [
                            topicName,
                            null,        // partition
                            null,        // message
                            kafkaKey,
                            Date.now(),
                            null,        // opaque
                            headersOut
                        ],
                        logger
                    );

                    consumer.commitMessage(msg);
                    logger.info(
                        `['lastdata'] Sent to topic '${topicName}', headers: ${JSON.stringify(
                            headersOut.map(h => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.toString()])))
                        )}, entityid: ${deleteEntity.entityid}`
                    );
                } else {
                    await handleEntityCb(
                        logger,
                        rawValue, // rawValue has all entities, no just first
                        {
                            headers: msg.headers,
                            suffix: suffix,
                            flowSuffix: '_lastdata',
                            includeTimeinstant: false,
                            keyFields: ['entityid'],
                            datamodel
                        },
                        producer
                    );
                    consumer.commitMessage(msg);
                }
            } catch (err) {
                logger.error('[lastdata] Error processing event:', err);
            }

            const duration = (Date.now() - start) / 1000;
            messagesProcessed.labels({ flow: 'lastdata' }).inc();
            processingTime.labels({ flow: 'lastdata' }).set(duration);
        }
    });

    return consumer;
}

module.exports = startLastdataConsumerAgent;
