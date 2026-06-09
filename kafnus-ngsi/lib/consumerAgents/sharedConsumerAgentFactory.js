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

const Kafka = require('@confluentinc/kafka-javascript');
const PQueue = require('p-queue').default;
const { config } = require('../../kafnusConfig');

// ================= SETUP =================

function buildConsumer(groupId) {
    const configKafka = { ...config.kafkaConsumer, 'group.id': groupId };

    return new Kafka.KafkaConsumer(configKafka, {
        'auto.offset.reset': config.kafkaConsumer['auto.offset.reset']
    });
}

function createState() {
    return {
        paused: false,
        producerQueueFull: false,
        MAX_BUFFERED_TASKS: 1000
    };
}

// ================= PRODUCER =================

function setupProducerListener(producer, state) {
    producer.on('delivery-report', () => {
        if (!state.producerQueueFull) {
            return;
        }

        state.producerQueueFull = false;
        state.resume();
    });
}

// ================= READY =================

function onReady(consumer, logger, topic, { groupId }) {
    consumer.subscribe([topic]);
    consumer.consume();
    logger.info(`ConsumerAgent ready — topic=${topic} group=${groupId}`);
}

// ================= CONSUMER HANDLERS =================

function setupConsumerHandlers(consumer, ctx) {
    const { logger, topic } = ctx;

    consumer
        .on('ready', () => onReady(consumer, logger, topic, ctx))
        .on('data', (msg) => onDataEvent(consumer, msg, ctx))
        .on('event.error', (err) => logger.error(`Event error on topic ${topic}:`, err))
        .on('disconnected', () => logger.info(`ConsumerAgent disconnected from topic ${topic}`));

    bindPauseResume(consumer, ctx);
}

// ================= PROCESS =================

function getBacklog(queue) {
    return queue.size + queue.pending;
}

function handleQueueRecovery(state, queue) {
    const backlog = getBacklog(queue);

    if (!state.paused || state.producerQueueFull) {
        return;
    }

    if (backlog < state.MAX_BUFFERED_TASKS / 2) {
        state.resume();
    }
}

async function processMessage(consumer, message, ctx) {
    const { onData, state, logger, queue } = ctx;

    if (state.producerQueueFull) {
        state.pause();
        return;
    }

    try {
        await onData(message);
        handleQueueRecovery(state, queue);
    } catch (err) {
        handleProcessingError(err, state, logger);
        throw err;
    }
}

// ================= BACKPRESSURE =================

function checkBackpressure(backlog, ctx) {
    const { state, logger, queue } = ctx;

    if (backlog < state.MAX_BUFFERED_TASKS || state.paused) {
        return;
    }

    state.pause();
    logger.warn(`[consumer] backlog high (${backlog}) size=${queue.size} pending=${queue.pending}`);
}

// ================= DATA =================

function onDataEvent(consumer, message, ctx) {
    const backlog = getBacklog(ctx.queue);

    checkBackpressure(backlog, ctx);

    ctx.queue
        .add(() => processMessage(consumer, message, ctx))
        .catch(() => {
            // avoid unhandled rejection
        });
}

// ================= ERROR =================

function handleProcessingError(err, state, logger) {
    if (err.code === Kafka.CODES.ERRORS.ERR__QUEUE_FULL) {
        state.producerQueueFull = true;
        state.pause();
        return;
    }

    logger.error(`[consumer] Processing error: %s`, err?.stack || err);
}

// ================= PAUSE / RESUME =================

function pauseConsumer(consumer, state, logger) {
    if (state.paused) {
        return;
    }

    try {
        consumer.pause(consumer.assignments());
        state.paused = true;
        logger.warn('[consumer] Paused due to backpressure');
    } catch (err) {
        logger.error('[consumer] Failed to pause', err?.stack || err);
    }
}

function resumeConsumer(consumer, state, logger) {
    if (!state.paused) {
        return;
    }

    try {
        consumer.resume(consumer.assignments());
        state.paused = false;
        logger.info('[consumer] Resumed');
    } catch (err) {
        logger.error('[consumer] Failed to resume', err?.stack || err);
    }
}

function bindPauseResume(consumer, ctx) {
    const { logger, state } = ctx;

    state.pause = () => pauseConsumer(consumer, state, logger);
    state.resume = () => resumeConsumer(consumer, state, logger);
}

// ================= CONNECT =================

function connectConsumer(consumer, logger, topic) {
    return new Promise((resolve, reject) => {
        consumer.on('ready', () => resolve(consumer));

        try {
            consumer.connect();
            logger.info('[consumer] connected');
        } catch (err) {
            reject(err);
        }
    });
}

// ================= CREATE Consumer Agent =================

function createConsumerAgent(logger, { groupId, topic, onData, producer }) {
    const consumer = buildConsumer(groupId);
    const queue = new PQueue({ concurrency: 1 });

    const state = createState();

    setupProducerListener(producer, state);
    setupConsumerHandlers(consumer, {
        logger,
        topic,
        groupId,
        queue,
        onData,
        state
    });

    return connectConsumer(consumer, logger, topic);
}

module.exports = { createConsumerAgent };
