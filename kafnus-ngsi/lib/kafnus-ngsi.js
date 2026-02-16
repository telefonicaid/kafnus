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

const { config } = require('../kafnusConfig');
const logger = require('./utils/logger');

logger.initLogger(config);

const startHistoricConsumerAgent = require('./consumerAgents/historicConsumerAgent');
const startLastdataConsumerAgent = require('./consumerAgents/lastdataConsumerAgent');
const startMutableConsumerAgent = require('./consumerAgents/mutableConsumerAgent');
const startErrorsConsumerAgent = require('./consumerAgents/errorsConsumerAgent');
const startMongoConsumerAgent = require('./consumerAgents/mongoConsumerAgent');
const startSgtrConsumerAgent = require('./consumerAgents/sgtrConsumerAgent');

const { startAdminServer } = require('./utils/admin');

const { createProducer } = require('./consumerAgents/sharedProducerFactory');
const { shutdownConsumer } = require('./consumerAgents/consumer');

async function main() {
    const log = logger.getBasicLogger();

    log.info('Starting application...');

    // 1 global producer
    const producer = await createProducer(log);

    log.info('Starting all consumers...');

    const started = await Promise.all([
        startAdminServer(log, config.admin.port),

        // Use the same producer
        startHistoricConsumerAgent(log, producer),
        startLastdataConsumerAgent(log, producer),
        startMutableConsumerAgent(log, producer),
        startErrorsConsumerAgent(log, producer),
        startMongoConsumerAgent(log, producer),
        startSgtrConsumerAgent(log, producer)
    ]);

    const consumers = started.filter(Boolean);

    // Shutdown
    const shutdown = async (signal) => {
        log.info(`[shutdown] Received ${signal}`);

        // Pause all consumers
        for (const consumer of consumers) {
            try {
                consumer.pause();
            } catch (_) {}
        }

        // Wait for all messages on the fly
        await new Promise((r) => setTimeout(r, 1000));

        // Disconnect each consumer
        for (const consumer of consumers) {
            await shutdownConsumer(consumer, log, consumer.topic || 'unknown');
        }

        // Flush and disconnect from global producer
        await shutdownProducer(log);

        log.info('[shutdown] Completed');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    logger.getBasicLogger().error('Error starting consumers', err);
    process.exit(1);
});
