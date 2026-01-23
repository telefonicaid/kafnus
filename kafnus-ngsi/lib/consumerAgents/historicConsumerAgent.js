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
const { handleEntityCb } = require('../utils/handleEntityCb');
const { messagesProcessed, processingTime } = require('../utils/admin');
const { config } = require('../../kafnusConfig');

async function startHistoricConsumerAgent(logger, producer) {
    const topic = config.ngsi.prefix + 'raw_historic';
    const groupId = 'ngsi-processor-historic';
    const suffix = '_historic' + config.ngsi.suffix;

    const consumer = await createConsumerAgent(logger, {
        groupId,
        topic,
        producer,
        onData: async (msg) => {
            const start = Date.now();
            const k = msg.key?.toString() || '';
            const v = msg.value?.toString() || '';
            logger.info(`[raw_historic] Key: ${k}, Value: ${v}`);

            try {
                await handleEntityCb(
                    logger,
                    v,
                    {
                        headers: msg.headers,
                        suffix: suffix,
                        flowSuffix: '_historic',
                        includeTimeinstant: true,
                        keyFields: ['entityid']
                    },
                    producer
                );
                consumer.commitMessage(msg);
            } catch (err) {
                logger.error(` [historic] Error processing event: ${err}`);
            }

            const duration = (Date.now() - start) / 1000;
            messagesProcessed.labels({ flow: 'historic' }).inc();
            processingTime.labels({ flow: 'historic' }).set(duration);
        }
    });

    return consumer;
}

module.exports = startHistoricConsumerAgent;
