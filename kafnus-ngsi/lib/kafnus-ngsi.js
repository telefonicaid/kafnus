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

async function shutdownKafkaProducer(producer, log) {
    log.info('[shutdown] shutting down producer');
    await shutdownProducer(producer, log);
}

async function main() {
    const log = logger.createChildLogger();

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

    function shouldSkipShutdown() {
        return shuttingDown;
    }

    function markShuttingDown() {
        shuttingDown = true;
    }

    function delay(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    async function closeAdminServer(adminServer, log) {
        log.info('[shutdown] closing admin server');
        if (!adminServer?.close) {
            return;
        }
        await new Promise((r) => adminServer.close(r));
    }

    function getConsumerName(c) {
        return c.topic || c.groupId || c.clientId || 'unknown';
    }

    async function shutdownConsumers(consumers, log) {
        log.info('[shutdown] disconnecting consumers');
        for (const c of consumers) {
            const name = getConsumerName(c);
            await withTimeout(shutdownConsumer(c, log, name), 8000, `shutdownConsumer(${name})`);
        }
    }

    function withTimeout(promise, ms, label) {
        return Promise.race([
            promise,
            new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms: ${label}`)), ms))
        ]);
    }

    function handleShutdownError(err, log) {
        log.error('[shutdown] Failed', err);
        process.exitCode = 1;
    }

    const shutdown = async (signal) => {
        if (shouldSkipShutdown()) {
            return;
        }
        markShuttingDown();
        log.info(`[shutdown] Received ${signal}`);
        try {
            await delay(1000);
            await closeAdminServer(adminServer, log);
            await shutdownConsumers(consumers, log);
            await shutdownKafkaProducer(producer, log);
            log.info('[shutdown] Completed');
            process.exitCode = 0;
        } catch (err) {
            handleShutdownError(err, log);
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
