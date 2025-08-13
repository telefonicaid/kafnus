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

'use strict';

const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { createProducer } = require('./sharedProducerFactory');
const { encodeMongo } = require('../utils/ngsiUtils');
const { DateTime } = require('luxon');

async function startMongoConsumerAgent(logger) {
  const topic = 'raw_mongo';
  const outputTopic = 'tests_mongo';
  const groupId = /* process.env.GROUP_ID || */ 'ngsi-processor-mongo';

  const producer = await createProducer(logger);

  const consumer = await createConsumerAgent(
   logger,
   {
    groupId,
    topic,
    onData: async ({ key, value }) => {
      try {
        const rawValue = value ? value.toString() : null;
        if (!rawValue) return;
        const k = key ? key.toString() : null;
        logger.info(`[mongo] key=${k} value=${rawValue}`);
        const data = JSON.parse(rawValue);
        const headers = data.headers || {};
        const body = data.body || {};
        const attributes = body.attributes || [];

        const fiwareService = headers['fiware-service'] || 'default';
        const servicePath = headers['fiware-servicepath'] || '/';

        // Encode database and collection
        const mongoDb = `sth_${encodeMongo(fiwareService)}`;
        const mongoCollection = `sth_${encodeMongo(servicePath)}`;

        const timestamp = headers.timestamp || Math.floor(Date.now() / 1000);
        const recvTimeTs = String(timestamp * 1000);
        const recvTime = DateTime.fromSeconds(timestamp, { zone: 'utc' }).toISO();

        // Final document
        const doc = {
          recvTimeTs,
          recvTime,
          entityId: body.entityId,
          entityType: body.entityType
        };

        for (const attr of attributes) {
          doc[attr.attrName] = attr.attrValue;
        }
        logger.info(`[mongo] topic: ${topic}`);
        logger.info(`[mongo] database: ${mongoDb}`);
        logger.info(`[mongo] collection: ${mongoCollection}`);
        logger.info(`[mongo] doc: ${doc}`);
        // Publish in output topic
        producer.produce(
            outputTopic,
            null, // partition null: kafka decides
            Buffer.from(JSON.stringify(doc)), // message
            Buffer.from(JSON.stringify({ // key (optional)
                database: mongoDb,
                collection: mongoCollection
              })),
            Date.now()
        );

        logger.info(`[mongo] Sent to '${outputTopic}' | DB: ${mongoDb}, Collection: ${mongoCollection}`);
      } catch (err) {
        logger.error(`[mongo] Error processing event: ${err.message}`);
      }
    }
  });

  return consumer;
}


module.exports = startMongoConsumerAgent;
