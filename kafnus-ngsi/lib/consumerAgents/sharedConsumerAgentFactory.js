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

function createConsumerAgent(logger, { groupId, topic, onData, producer }) {
    const configKafka = { ...config.kafkaConsumer, 'group.id': groupId };

    const consumer = new Kafka.KafkaConsumer(configKafka, {
        'auto.offset.reset': config.kafkaConsumer['auto.offset.reset']
    });

    // Queue for processing: just 1 message at the same time
    const queue = new PQueue({ concurrency: 1 });
    const MAX_BUFFERED_TASKS = 1000;
    let paused = false;
    let producerQueueFull = false;

    function pauseConsumer() {
        if (!paused) {
            consumer.pause([{ topic }]);
            paused = true;
            logger.warn(`[consumer] Paused due to producer backpressure`);
        }
    }

    function resumeConsumer() {
        if (paused) {
            consumer.resume([{ topic }]);
            paused = false;
            logger.info(`[consumer] Resumed`);
        }
    }

    // Listen delivery-reports to release presure
    producer.on('delivery-report', () => {
        if (producerQueueFull) {
            producerQueueFull = false;
            resumeConsumer();
        }
    });

    return new Promise((resolve, reject) => {
        consumer
            .on('ready', () => {
                consumer.subscribe([topic]);
                consumer.consume();
                logger.info(`ConsumerAgent ready — topic=${topic} group=${groupId}`);
                resolve(consumer);
            })
            .on('data', (message) => {
                if (queue.size >= MAX_BUFFERED_TASKS) {
                    pauseConsumer();
                    // Check: message could be already delivered; queue or discard
                }
                queue.add(async () => {
                    try {
                        await onData(message);
                    } catch (err) {
                        if (err.code === Kafka.CODES.ERRORS.QUEUE_FULL) {
                            producerQueueFull = true;
                            pauseConsumer();
                            throw err; // do not continue
                        }
                        logger.error(`[consumer] Processing error: %s`, err?.stack || err);
                        throw err;
                    } finally {
                        // when queue is low then resume
                        if (paused && !producerQueueFull && queue.size < MAX_BUFFERED_TASKS / 2) {
                            resumeConsumer();
                        }
                    }
                });
            })
            .on('event.error', (err) => {
                logger.error(`Event error on topic ${topic}:`, err);
            })
            .on('disconnected', () => {
                logger.info(`ConsumerAgent disconnected from topic ${topic}`);
            });

        try {
            consumer.connect();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { createConsumerAgent };
