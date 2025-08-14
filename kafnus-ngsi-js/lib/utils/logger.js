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

/* eslint-disable no-underscore-dangle */

'use strict';


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
    op: 'n/a',
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
    corr: (config && config.corr) || uuidv4(),
  });
}

module.exports.createChildLogger = createChildLogger;
module.exports.initLogger = initLogger;
module.exports.getBasicLogger = getBasicLogger;

