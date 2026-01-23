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

/* eslint-disable no-underscore-dangle */

const logger = require('logops');
const { v4: uuidv4 } = require('uuid');
const packageInfo = require('../../package.json');

/**
 *  Initializes the logger
 */
function initLogger(config) {
    logger.format = logger.formatters.pipe;
    logger.setLevel(config.logger.level);

    logger.getContext = () => ({
        ver: packageInfo.version,
        corr: 'n/a',
        trans: 'n/a',
        ob: config.logger.ob,
        comp: config.logger.comp,
        op: 'n/a'
    });
}

/**
 * Return the basic logger (i.e. not associated to any request). This is used for instance
 * for startup messages
 */
function getBasicLogger() {
    return logger;
}

/**
 * Create a brand new child logger
 */
function createChildLogger(config) {
    const loggerCtx = logger.getContext();
    return logger.child({
        op: (config && config.op) || loggerCtx.op,
        corr: (config && config.corr) || uuidv4()
    });
}

module.exports.createChildLogger = createChildLogger;
module.exports.initLogger = initLogger;
module.exports.getBasicLogger = getBasicLogger;
