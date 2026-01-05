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
const { handleEntityCb } = require('../utils/handleEntityCb');
const { messagesProcessed, processingTime } = require('../utils/admin');
const { config } = require('../../kafnusConfig');

async function startMutableConsumerAgent(logger, producer) {
    const topic = config.ngsi.prefix + 'raw_mutable';
    const groupId = 'ngsi-processor-mutable';
    const datamodel = /*process.env.DATAMODEL ||*/ 'dm-by-entity-type-database';
    const suffix = '_mutable' + config.ngsi.suffix;

    const consumer = await createConsumerAgent(logger, {
        groupId,
        topic,
        producer,
        onData: async (msg) => {
            const start = Date.now();
            const k = msg.key?.toString() || '';
            const v = msg.value?.toString() || '';
            logger.info(`[raw_mutable] Key: ${k}, Value: ${v}`);

            try {
                logger.info(`rawValue: '${v}'`);
                await handleEntityCb(
                    logger,
                    v,
                    {
                        headers: msg.headers,
                        suffix,
                        flowSuffix: '_mutable',
                        includeTimeinstant: true,
                        keyFields: ['entityid'],
                        datamodel
                    },
                    producer
                );
                consumer.commitMessage(msg);
            } catch (err) {
                logger.error(` [mutable] Error processing event: ${err}`);
            }

            const duration = (Date.now() - start) / 1000;
            messagesProcessed.labels({ flow: 'mutable' }).inc();
            processingTime.labels({ flow: 'mutable' }).set(duration);
        }
    });

    return consumer;
}

module.exports = startMutableConsumerAgent;
