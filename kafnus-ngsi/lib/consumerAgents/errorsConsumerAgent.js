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

const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { formatDatetimeIso } = require('../utils/ngsiUtils');
const { safeProduce } = require('../utils/handleEntityCb');
const { messagesProcessed, processingTime } = require('../utils/admin');
const { config } = require('../../kafnusConfig');

async function startErrorsConsumerAgent(logger, producer) {
    const topic = config.ngsi.prefix + 'raw_errors';
    const groupId = 'ngsi-processor-errors';
    const suffix = config.ngsi.suffix;

    const consumer = await createConsumerAgent(logger, {
        groupId,
        topic,
        producer,
        onData: async (msg) => {
            const start = Date.now();
            const k = msg.key?.toString() || null;
            const valueRaw = msg.value?.toString() || '';

            logger.info(`[errors] key=${k} value=${valueRaw}`);

            try {
                let valueJson;
                try {
                    valueJson = JSON.parse(valueRaw);
                } catch (e) {
                    logger.warn(`[errors] Invalid JSON payload, skipping: ${e.message}`);
                    consumer.commitMessage(msg);
                    return;
                }

                const hdrs = {};
                if (msg.headers && msg.headers.length > 0) {
                    msg.headers.forEach((headerObj) => {
                        const headerName = Object.keys(headerObj)[0];
                        hdrs[headerName] = Buffer.from(headerObj[headerName]).toString();
                    });
                }

                logger.info('[errors] headers=%j', hdrs);

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
                if (config.ngsi.prefix && dbName.startsWith(config.ngsi.prefix)) {
                    dbName = dbName.slice(config.ngsi.prefix.length);
                }
                dbName = dbName.replace(/_(historic|lastdata|mutable|http).*$/, '');

                const errorTopicName = `${config.ngsi.prefix}${dbName}_error_log` + suffix;

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
                    const table = hdrs.target_table || 'unknown_table';

                    if (Object.keys(payload).length > 0) {
                        const columns = Object.keys(payload)
                            .map((k) => `"${k}"`)
                            .join(',');
                        const values = Object.values(payload).map((v) => {
                            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
                            if (v == null) return 'NULL';
                            return v.toString();
                        });
                        originalQuery = `INSERT INTO "${dbName}"."${table}" (${columns}) VALUES (${values.join(',')})`;
                    } else {
                        originalQuery = JSON.stringify(valueJson);
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

                const headersOut = [{ 'fiware-service': Buffer.from(dbName) }];

                await safeProduce(producer, [
                    errorTopicName,
                    null,
                    Buffer.from(JSON.stringify(errorRecord)),
                    null,
                    Date.now(),
                    null,
                    headersOut
                ]);

                logger.info(`[errors] Logged SQL error to '${errorTopicName}'`);

                consumer.commitMessage(msg);
            } catch (err) {
                logger.error('[errors] Error processing event, offset NOT committed', err);
            }

            const duration = (Date.now() - start) / 1000;
            messagesProcessed.labels({ flow: 'errors' }).inc();
            processingTime.labels({ flow: 'errors' }).set(duration);
        }
    });

    return consumer;
}

module.exports = startErrorsConsumerAgent;
