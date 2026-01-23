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
*
* Authors: 
*  - Álvaro Vega
*  - Gregorio Blázquez
*/

const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { handleEntityCb, safeProduce } = require('../utils/handleEntityCb');
const { buildKafkaKey, sanitizeString, getFiwareContext } = require('../utils/ngsiUtils');
const { messagesProcessed, processingTime } = require('../utils/admin');
const { config } = require('../../kafnusConfig');

async function startLastdataConsumerAgent(logger, producer) {
    const topic = config.ngsi.prefix + 'raw_lastdata';
    const groupId = 'ngsi-processor-lastdata';
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
                            keyFields: ['entityid']
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
