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
const { formatDatetimeIso } = require('../utils/ngsiUtils');

async function startErrorsConsumerAgent(logger) {
  const topic = 'raw_errors';
  const groupId = /*process.env.GROUP_ID ||*/ 'ngsi-processor-errors';

  const producer = await createProducer(logger);

  const consumer = await createConsumerAgent(logger, { groupId, topic, onData: ({ key, value }) => {
    try {
        const k = key ? key.toString() : null;
        const valueRaw = value ? value.toString() : '';
        logger.info(`[errors] key=${k} value=${valueRaw}`);
        let valueJson;
        try {
          valueJson = JSON.parse(valueRaw);
        } catch (e) {
          logger.warn(`Could not parse JSON payload: ${e.message}`);
          return;
        }

        const hdrs = {};
        if (headers) {
          for (const [hk, hv] of Object.entries(headers)) {
            hdrs[hk] = hv.toString();
          }
        }

        let fullErrorMsg = hdrs['__connect.errors.exception.message'] || 'Unknown error';
        const causeMsg = hdrs['__connect.errors.exception.cause.message'];
        if (causeMsg && !fullErrorMsg.includes(causeMsg)) {
          fullErrorMsg += `\nCaused by: ${causeMsg}`;
        }

        const timestamp = formatDatetimeIso('UTC');

        let dbName = hdrs['__connect.errors.topic'] || '';
        if (!dbName) {
          const dbMatch = fullErrorMsg.match(/INSERT INTO "([^"]+)"/);
          if (dbMatch) {
            dbName = dbMatch[1].split('.')[0];
          }
        }

        dbName = dbName.replace(/_(lastdata|mutable)$/, '');
        const errorTopicName = `${dbName}_error_log`;

        let errorMessage;
        const errMatch = fullErrorMsg.match(/(ERROR: .+?)(\n|$)/);
        if (errMatch) {
          errorMessage = errMatch[1].trim();
          const detailMatch = fullErrorMsg.match(/(Detail: .+?)(\n|$)/);
          if (detailMatch) {
            errorMessage += ` - ${detailMatch[1].trim()}`;
          }
        } else {
          errorMessage = fullErrorMsg;
        }

        let originalQuery;
        const queryMatch = fullErrorMsg.match(/(INSERT INTO "[^"]+"[^)]+\)[^)]*\))/);
        if (queryMatch) {
          originalQuery = queryMatch[1];
        } else {
          const payload = valueJson.payload || {};
          const table = hdrs['target_table'] || 'unknown_table';
          if (Object.keys(payload).length > 0) {
            const columns = Object.keys(payload)
              .map(k => `"${k}"`)
              .join(',');
            const values = Object.values(payload).map(v => {
              if (typeof v === 'string') {
                return `'${v.replace(/'/g, "''")}'`;
              } else if (v === null || v === undefined) {
                return 'NULL';
              }
              return v.toString();
            });
            originalQuery = `INSERT INTO "${dbName}"."${table}" (${columns}) VALUES (${values.join(',')})`;
          } else {
            originalQuery = '';
          }
        }

        const errorRecord = {
          schema: {
            type: 'struct',
            fields: [
              { field: 'timestamp', type: 'string', optional: false },
              { field: 'error', type: 'string', optional: false },
              { field: 'query', type: 'string', optional: true }
            ],
            optional: false
          },
          payload: {
            timestamp,
            error: errorMessage,
            query: originalQuery
          }
        };

        producer.produce(
            errorTopicName,
            null, // Partition null: kafka decides
            JSON.stringify(errorRecord),
            null, // key optional
            Date.now()
        );

        logger.info(`Logged SQL error to '${errorTopicName}': ${errorMessage}`);

    } catch (err) {
      logger.error('Error proccesing event:', err);
    }
  }});

  return consumer;
}

module.exports = startErrorsConsumerAgent;
