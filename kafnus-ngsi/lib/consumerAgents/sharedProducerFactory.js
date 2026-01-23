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
*
* Authors: 
*  - Álvaro Vega
*  - Gregorio Blázquez
*  - Fermín Galán
*  - Oriana Romero
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
