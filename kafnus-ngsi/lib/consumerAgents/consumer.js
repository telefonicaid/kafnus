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

async function shutdownConsumer(consumer, logger, topic = 'unknown') {
    try {
        consumer.pause([{ topic }]);
        logger.info(`[shutdown] Consumer paused (${topic})`);
    } catch (_) {}

    await new Promise((resolve) => {
        try {
            consumer.disconnect(() => {
                logger.info(`[shutdown] Consumer disconnected (${topic})`);
                resolve();
            });
        } catch (_) {
            resolve();
        }
    });
}

module.exports = { shutdownConsumer };
