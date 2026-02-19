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
async function shutdownConsumer(consumer, logger, name) {
    // 1) Try stop stream/loop
    try {
        // Using streams, store ref to stream and stream.destroy()
        consumer.unsubscribe?.();
    } catch (e) {
        logger.warn?.(`[shutdown] ${name}: pre-disconnect cleanup failed`, e);
    }

    // 2) disconnect with callback -> promise
    await new Promise((resolve, reject) => {
        // node-rdkafka disconnect is callback-style
        consumer.disconnect((err) => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
}

module.exports = { shutdownConsumer };
