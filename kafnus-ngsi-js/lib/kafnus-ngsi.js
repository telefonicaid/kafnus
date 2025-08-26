/*
 * Copyright 2025 Telefonica Soluciones de Informatica y Comunicaciones de Espa�a, S.A.U.
 * PROJECT: Kafnus
 *
 * This software and / or computer program has been developed by Telef�nica Soluciones
 * de Inform�tica y Comunicaciones de Espa�aa, S.A.U (hereinafter TSOL) and is protected
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

const { config } = require('../kafnusConfig');
const logger = require('./utils/logger');

logger.initLogger(config);

const startHistoricConsumerAgent = require('./consumerAgents/historicConsumerAgent');
const startLastdataConsumerAgent = require('./consumerAgents/lastdataConsumerAgent');
const startMutableConsumerAgent = require('./consumerAgents/mutableConsumerAgent');
const startErrorsConsumerAgent = require('./consumerAgents/errorsConsumerAgent');
const startMongoConsumerAgent = require('./consumerAgents/mongoConsumerAgent');
const startSgtrConsumerAgent = require('./consumerAgents/sgtrConsumerAgent');

const { startMetricsServer } = require('./utils/metrics');

async function main() {
    const log = logger.getBasicLogger();

    log.info('Starting all consumers...');

    const started = await Promise.all([
        startMetricsServer(log, 8000),
        startHistoricConsumerAgent(log),
        startLastdataConsumerAgent(log),
        startMutableConsumerAgent(log),
        startErrorsConsumerAgent(log),
        startMongoConsumerAgent(log),
        startSgtrConsumerAgent(log)
    ]);

    const consumers = started.filter(Boolean);

    // Graceful shutdown
    const shutdown = async () => {
        log.info('Shutting down consumers(agents)...');
        await Promise.all(
            consumers.map(
                (c) =>
                    new Promise((resolve) => {
                        try {
                            c.disconnect();
                        } catch (err) {
                            /* ignore */
                        }
                        resolve();
                    })
            )
        );
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    logger.getBasicLogger().error('Error starting consumers: %j', err);
    process.exit(1);
});
