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

const { createProducer, shutdownProducer } = require('./consumerAgents/sharedProducerFactory');
const { shutdownConsumer } = require('./consumerAgents/consumer');

async function main() {
    const log = logger.getBasicLogger();

    log.info('Starting application...');

    // 1 global producer
    const producer = await createProducer(log);
    producer.setPollInterval(10); // process delivery reports allow not fill internal queue

    const adminServer = await startAdminServer(log, config.admin.port);

    log.info('Starting all consumers...');
    const consumers = (
        await Promise.all([
            startHistoricConsumerAgent(log, producer),
            startLastdataConsumerAgent(log, producer),
            startMutableConsumerAgent(log, producer),
            startErrorsConsumerAgent(log, producer),
            startMongoConsumerAgent(log, producer),
            startSgtrConsumerAgent(log, producer)
        ])
    ).filter(Boolean);

    let shuttingDown = false;

    const shutdown = async (signal) => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        log.info(`[shutdown] Received ${signal}`);
        try {
            await new Promise((r) => setTimeout(r, 1000));
            // close server firstly to stop receive traffic
            if (adminServer?.close) {
                await new Promise((r) => adminServer.close(r));
            }
            log.info('[shutdown] disconnecting consumers');
            const withTimeout = (p, ms, label) =>
                Promise.race([
                    p,
                    new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms: ${label}`)), ms))
                ]);
            for (const c of consumers) {
                const name = c.topic || c.groupId || c.clientId || 'unknown';
                await withTimeout(shutdownConsumer(c, log, name), 8000, `shutdownConsumer(${name})`);
            }
            log.info('[shutdown] shutting down producer');
            await shutdownProducer(producer, log);
            log.info('[shutdown] Completed');
            process.exitCode = 0;
        } catch (err) {
            log.error('[shutdown] Failed', err);
            process.exitCode = 1;
        } finally {
            process.exit();
        }
    };
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
    logger.getBasicLogger().error('Error starting consumers', err);
    process.exit(1);
});
