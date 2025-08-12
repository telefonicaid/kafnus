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

require('dotenv').config();
const { error, info } = require('./utils/logger');

const startHistoricConsumerAgent = require('./consumerAgents/historicConsumerAgent');
const startLastdataConsumerAgent = require('./consumerAgents/lastdataConsumerAgent');
const startMutableConsumerAgent = require('./consumerAgents/mutableConsumerAgent');
const startErrorsConsumerAgent = require('./consumerAgents/errorsConsumerAgent');
const startMongoConsumerAgent = require('./consumerAgents/mongoConsumerAgent');

async function main() {
  info('Starting all consumers...');

  const started = await Promise.all([
    startHistoricConsumerAgent(),
    startLastdataConsumerAgent(),
    startMutableConsumerAgent(),
    startErrorsConsumerAgent(),
    startMongoConsumerAgent()
  ]);

  const consumers = started.filter(Boolean);

  // Graceful shutdown
  const shutdown = async () => {
      info('Shutting down consumers(agents)...');
    await Promise.all(consumers.map(c => new Promise((resolve) => {
      try {
        c.disconnect();
      } catch (err) { /* ignore */ }
      resolve();
    })));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  error('Error starting consumers:', err);
  process.exit(1);
});
