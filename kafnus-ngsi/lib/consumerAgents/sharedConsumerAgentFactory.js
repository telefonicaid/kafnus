/*
 * Copyright 2025 Telefonica Soluciones de Informatica y Comunicaciones de España, S.A.U.
 * PROJECT: Kafnus
 *
 * This software and / or computer program has been developed by TelefÃ³nica Soluciones
 * de InformÃ¡tica y Comunicaciones de EspaÃ±a, S.A.U (hereinafter TSOL) and is protected
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

const Kafka = require('@confluentinc/kafka-javascript');
const { config } = require('../../kafnusConfig');

const Kafka = require('@confluentinc/kafka-javascript');
const PQueue = require('p-queue').default;
const { config } = require('../../kafnusConfig');

function createConsumerAgent(logger, { groupId, topic, onData, producer }) {
    const configKafka = { ...config.kafka, 'group.id': groupId };

    const consumer = new Kafka.KafkaConsumer(configKafka, {
        'auto.offset.reset': config.kafka['auto.offset.reset']
    });

    // Queue for processing: just 1 message at the same time
    const queue = new PQueue({ concurrency: 1 });

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
                queue.add(async () => {
                    if (producerQueueFull) {
                        pauseConsumer();
                        return;
                    }

                    try {
                        await onData(message);
                    } catch (err) {
                        if (err.code === Kafka.CODES.ERRORS.QUEUE_FULL) {
                            producerQueueFull = true;
                            pauseConsumer();
                        } else {
                            logger.error(`[consumer] Processing error: %j`, err);
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
