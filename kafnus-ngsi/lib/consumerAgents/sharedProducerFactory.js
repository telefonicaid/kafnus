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
const Kafka = require('@confluentinc/kafka-javascript');
const { config } = require('../../kafnusConfig');

let producerInstance = null;
let producerReady = false;

async function createProducer(logger) {
    if (producerInstance && producerReady) {
        return producerInstance;
    }

    producerInstance = new Kafka.Producer(config.kafkaProducer);

    await new Promise((resolve, reject) => {
        producerInstance
            .on('ready', () => {
                producerReady = true;
                logger.info('[producer] Global producer ready');
                resolve();
            })
            .on('event.error', (err) => {
                logger.error('[producer] error', err);
            })
            .on('delivery-report', (err) => {
                if (err) logger.error('[producer] delivery error', err);
            });

        producerInstance.connect();
    });

    return producerInstance;
}

function getProducer() {
    if (!producerInstance || !producerReady) {
        throw new Error('Producer not initialized');
    }
    return producerInstance;
}

async function shutdownProducer(logger, timeoutMs = 10000) {
    const producer = producerInstance;
    if (!producer) {
        return;
    }

    logger.info('[shutdown] Flushing producer...');
    producer.removeAllListeners('delivery-report');

    await new Promise((resolve) => {
        producer.flush(timeoutMs, () => {
            logger.info('[shutdown] Producer flush completed');
            try {
                producer.disconnect();
            } catch (_) {}
            logger.info('[shutdown] Producer disconnected');
            resolve();
        });
    });
}

module.exports = {
    createProducer,
    getProducer,
    shutdownProducer
};
