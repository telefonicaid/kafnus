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
const { getFiwareContext, handleEntityCb } = require('../utils/handleEntityCb');
const { buildKafkaKey } = require('../utils/ngsiUtils');

async function startLastdataConsumerAgent(logger) {
  const topic = 'raw_lastdata';
  const groupId = /*process.env.GROUP_ID ||*/ 'ngsi-processor-lastdata';
  const datamodel = 'dm-by-entity-type-database';
  const suffix = "_lastdata"

  const producer = await createProducer(logger);

  const consumer = await createConsumerAgent(
   logger, { groupId, topic, onData: async ({ key, value, headers }) => {
    const start = Date.now();
    const k = key ? key.toString() : null;
    const rawValue = value ? value.toString() : null;
    logger.info(`[lastdata] key=${k} value=${rawValue}`);

    try {
      //logger.info(`rawValue: '${rawValue}'`);
      const message = JSON.parse(rawValue);
      //logger.info(`message: '${message}'`);
      const payloadStr = message.payload;
      //logger.info(`payloadStr: '${payloadStr}'`);
      if (!payloadStr) {
        logger.warn('No payload found in message');
        return;
      }
      const payload = JSON.parse(payloadStr);
      //logger.info('payload: %j', payload);
      const dataList = payload.data || [];
      //logger.info('entities: %j', entities);
      if (dataList.length === 0) {
        logger.warn('No data found in payload');
        return;
      }
      const { service, servicepath } = getFiwareContext(headers, message);

      // TODO: check if all entities should be readed with a loop, not just first one
      const entityRaw = dataList[0];
      const entityId = entityRaw.id;
      const entityType = entityRaw.type ? entityRaw.type.toLowerCase() : undefined;
      const alteration = entityRaw.alterationType;
      let alterationType = null;
      if (alteration != undefined) {
        alterationType = alteration.value ? alteration.value.toLowerCase() : alteration.toLowerCase();
      } else {
        alterationType = "entityupdate"
      }
      if (!entityId) {
        logger.warn('No entity ID  found');
        return;
      }
      if (alterationType === "entitydelete") {
        const deleteEntity = {
          entityid: entityId,
          entitytype: entityType,
          fiwareservicepath: servicepath
        }
        const targetTable = buildTargetTable(datamodel, service, servicepath, entityId, entityType, suffix);
        const topicName = `${service}${suffix}`;
        const outputTopic = topicName;
        if (!keyFields) keyFields = ['entityid'];
        const kafkaKey = buildKafkaKey(eleteEntity, keyFields, includeTimeinstant );
        producer.produce(
          topicName,
          null, // partition null: kafka decides
          null, // message
          kafkaKey,
          Date.now(),
          [("target_table", Buffer.from(targetTable))], // headers
        );
        logger.info(`[${suffix.replace(/^_/, '') || 'lastdata'}] Sent to topic '${topicName}' (table: '${targetTable}'): ${entity.entityid}`);
      } else {
        await handleEntityCb(
          logger, rawValue, {
            headers: headers,
            suffix: suffix,
            includeTimeinstant: true,
            keyFields: ['entityid'],
            datamodel: datamodel
          },
          producer);
      }
    } catch (err) {
      logger.error('[lastdata] Error processing event: %j', err);
    }

    const duration = (Date.now() - start) / 1000;
      // TBD Metrics
    }
  });

  return consumer;
}

module.exports = startLastdataConsumerAgent;
