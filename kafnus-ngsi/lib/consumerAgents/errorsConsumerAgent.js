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
const { getFiwareContext, formatDatetimeIso, truncate } = require('../utils/ngsiUtils');
const { safeProduce } = require('../utils/handleEntityCb');
const { recordFlowProcessing } = require('../utils/admin');
const { config } = require('../../kafnusConfig');
const logger = require('../utils/logger');
const Kafka = require('@confluentinc/kafka-javascript');

// ================= JSON =================

function parseJson(raw, log, consumer, msg) {
    try {
        return JSON.parse(raw);
    } catch (e) {
        log.warn('[errors] Invalid JSON payload: %s', e.message);
        consumer.commitMessage(msg);
        return null;
    }
}

// ================= HEADERS =================

function extractHeaders(headersArray = []) {
    const result = {};

    headersArray.forEach((h) => {
        const key = Object.keys(h)[0];
        const val = h[key];
        result[key] = Buffer.isBuffer(val) ? val.toString() : String(val);
    });

    return result;
}

// ================= CONTEXT =================

function buildContext(msg) {
    const ctx = getFiwareContext(msg.headers, {});

    return {
        service: ctx.service,
        servicepath: ctx.servicepath,
        correlator: ctx.correlator
    };
}

function createContextLogger(context) {
    return logger.createChildLogger({
        op: 'errorsConsumer',
        corr: context.correlator,
        service: context.service,
        subservice: context.servicepath
    });
}

// ================= ERROR BUILD =================

function buildFullError(headers) {
    let msg = headers['__connect.errors.exception.message'] || 'Unknown error';
    const cause = headers['__connect.errors.exception.cause.message'];

    if (cause && !msg.includes(cause)) {
        msg += `\nCaused by: ${cause}`;
    }

    return msg;
}

// ================= DB NAME =================

function resolveDbName(headers, errorMsg) {
    let dbName = headers['__connect.errors.topic'] || '';

    if (!dbName) {
        const match = errorMsg.match(/INSERT INTO "([^"]+)"/);
        if (match) {
            dbName = match[1].split('.')[0];
        }
    }

    dbName = stripPrefix(dbName);
    dbName = cleanDbSuffix(dbName);

    return dbName;
}

function stripPrefix(dbName) {
    if (config.ngsi.prefix && dbName.startsWith(config.ngsi.prefix)) {
        return dbName.slice(config.ngsi.prefix.length);
    }
    return dbName;
}

function cleanDbSuffix(dbName) {
    return dbName.replace(/_(historic|lastdata|mutable|http).*$/, '');
}

function buildErrorTopic(dbName) {
    return `${config.ngsi.prefix}${dbName}_error_log${config.ngsi.suffix}`;
}

// ================= ERROR MESSAGE =================

function extractErrorMessage(fullErrorMsg) {
    let msg = fullErrorMsg;

    const main = fullErrorMsg.match(/(ERROR: .+?)(\n|$)/);
    if (main) {
        msg = main[1].trim();

        const detail = fullErrorMsg.match(/(Detail: .+?)(\n|$)/);
        if (detail) {
            msg += ` - ${detail[1].trim()}`;
        }
    }

    return truncate(msg, 4000);
}

// ================= QUERY =================

function extractOrBuildQuery(errorMsg, valueJson, headers, dbName) {
    const match = errorMsg.match(/(INSERT INTO "[^"]+"[^)]+\)[^)]*\))/);
    if (match) {
        return truncate(match[1], 8000);
    }

    return truncate(buildFallbackQuery(valueJson, headers, dbName), 8000);
}

function buildFallbackQuery(valueJson, headers, dbName) {
    const payload = valueJson.payload || {};
    const table = headers.target_table || 'unknown_table';

    if (Object.keys(payload).length === 0) {
        return JSON.stringify(valueJson);
    }

    const columns = Object.keys(payload)
        .map((k) => `"${k}"`)
        .join(',');

    const values = Object.values(payload).map(formatSqlValue);

    return `INSERT INTO "${dbName}"."${table}" (${columns}) VALUES (${values.join(',')})`;
}

function formatSqlValue(v) {
    if (typeof v === 'string') {
        return `'${v.replace(/'/g, "''")}'`;
    }
    if (v == null) {
        return 'NULL';
    }
    return v.toString();
}

// ================= RECORD =================

function buildErrorRecord(error, query) {
    return {
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
            timestamp: formatDatetimeIso('UTC'),
            error,
            query
        }
    };
}

// ================= OUTPUT =================

function buildOutputHeaders(dbName) {
    return [
        { 'fiware-service': Buffer.from(dbName) },
        { 'fiware-datamodel': Buffer.from('dm-postgis-errors') },
        { 'fiware-servicepath': Buffer.from(dbName) },
        { entityType: Buffer.from('_error_log') }
    ];
}

async function publishError(producer, topic, record, headers) {
    await safeProduce(producer, [topic, null, Buffer.from(JSON.stringify(record)), null, Date.now(), null, headers]);
}

// ================= ERROR HANDLING =================

function handleProcessingError(err, log, consumer, msg) {
    if (err?.code === Kafka.CODES.ERRORS.ERR__QUEUE_FULL) {
        throw err;
    }

    log?.error(`[errors] Error processing event: ${err?.stack || err}`);

    consumer.commitMessage(msg);

    return 'error';
}

// ================= MAIN =================

async function handleErrorMessage(msg, log, producer, consumer) {
    const start = Date.now();
    let processingResult = 'success';
    let fiwareService = 'default';
    let currentlog = log;

    try {
        const raw = msg.value?.toString() || '';

        const valueJson = parseJson(raw, log, consumer, msg);
        if (!valueJson) {
            return;
        }

        const headers = extractHeaders(msg.headers);
        log.info('[errors] headers=%j', headers);

        const context = buildContext(msg);
        currentlog = createContextLogger(context);
        fiwareService = context.service;

        const fullErrorMsg = buildFullError(headers);
        const dbName = resolveDbName(headers, fullErrorMsg);

        fiwareService = dbName || fiwareService;

        const errorTopic = buildErrorTopic(dbName);

        const errorMessage = extractErrorMessage(fullErrorMsg);
        const originalQuery = extractOrBuildQuery(fullErrorMsg, valueJson, headers, dbName);

        const record = buildErrorRecord(errorMessage, originalQuery);

        const headersOut = buildOutputHeaders(dbName);

        await publishError(producer, errorTopic, record, headersOut);

        currentlog.info(`[errors] Logged SQL error to '${errorTopic}'`);

        consumer.commitMessage(msg);
    } catch (err) {
        processingResult = handleProcessingError(err, currentlog, consumer, msg);
    } finally {
        recordFlowProcessing('errors', fiwareService, (Date.now() - start) / 1000, processingResult);
    }
}

// ================= ERROR Consumer =================

async function startErrorsConsumerAgent(log, producer) {
    const topic = config.ngsi.prefix + 'raw_errors';
    const groupId = 'ngsi-processor-errors';

    const consumer = await createConsumerAgent(log, {
        groupId,
        topic,
        producer,
        onData: (msg) => handleErrorMessage(msg, log, producer, consumer)
    });

    return consumer;
}

module.exports = startErrorsConsumerAgent;
