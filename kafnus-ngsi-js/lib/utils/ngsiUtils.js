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

const { Geometry } = require('wkx');
const { Buffer } = require('buffer');
const { geoJSONToWkt } = require('betterknown');
const { DateTime } = require('luxon');

const theLogger = require('./logger');
const logger = theLogger.getBasicLogger();

// -----------------
// WKT/WKB conversion
// -----------------
function toWkbStructFromWkt(wktStr, fieldName, srid = 4326) {
    try {
        const geom = Geometry.parse(wktStr);
        const wkb = geom.toWkb();
        const wkbB64 = Buffer.from(wkb).toString('base64');

        return {
            schema: {
                field: fieldName,
                type: 'struct',
                name: 'io.confluent.connect.jdbc.data.geometry.Geometry',
                fields: [
                    { field: 'wkb', type: 'bytes' },
                    { field: 'srid', type: 'int32' }
                ],
                optional: false
            },
            payload: {
                wkb: wkbB64,
                srid
            }
        };
    } catch (err) {
        logger.error(`Error generating WKB from WKT: ${err}`);
        return null;
    }
}

function toWktGeometry(attrType, attrValue) {
    try {
        if (attrType === 'geo:point') {
            if (typeof attrValue === 'string') {
                const [lat, lon] = attrValue.split(',').map(Number);
                return `POINT (${lon} ${lat})`;
            }
        } else if (attrType === 'geo:polygon') {
            const coords = attrValue.map((coordStr) => {
                const [lat, lon] = coordStr.split(',').map(Number);
                return `${lon} ${lat}`;
            });
            return `POLYGON ((${coords.join(', ')}))`;
        } else if (attrType === 'geo:json') {
            return geoJSONToWkt(attrValue);
        }
    } catch (err) {
        logger.error(`Error generating WKT from type '${attrType}': ${err}`);
    }
    return null;
}

// -----------------
// Topic sanitization
// -----------------
function sanitizeTopic(name) {
    return name
        .trim()
        .replace(/^\/|\/$/g, '')
        .toLowerCase()
        .replace(/[^a-zA-Z0-9_]/g, '_');
}

// -----------------
// Datetime helpers
// -----------------
function isPossibleDatetime(value) {
    if (!value) {
        return false;
    }
    //return !isNaN(Date.parse(value)); // TBD: Date.parse("NO-101") is non nan!!!
    return false;
}

function toEpochMillis(value) {
    return DateTime.fromISO(value, { zone: 'utc' }).toMillis();
}

function formatDatetimeIso(tz = 'UTC') {
    return DateTime.now().setZone(tz).toISO();
}

// -----------------
// Type inference
// -----------------
function inferFieldType(name, value, attrType = null) {
    const nameLc = name.toLowerCase();

    if (attrType) {
        if (attrType.startsWith('geo:')) {
            return ['geometry', value];
        }

        if (attrType === 'DateTime' || attrType === 'ISO8601') {
            if (['timeinstant', 'recvtime'].includes(nameLc)) {
                return ['string', String(value)];
            }
            try {
                if (value == null) {
                    return ['string', null];
                }
                return [{ type: 'int64', name: 'org.apache.kafka.connect.data.Timestamp' }, toEpochMillis(value)];
            } catch (err) {
                logger.warn(`Error parsing datetime for field '${name}': ${err}`);
                return ['string', String(value)];
            }
        }

        if (attrType === 'Float') {
            return ['float', parseFloat(value)];
        }

        if (attrType === 'Number') {
            const numVal = Number(value);

            if (Number.isNaN(numVal)) {
                return ['string', String(value)];
            }

            // ¿Integer?
            if (Number.isInteger(numVal)) {
                if (numVal >= -(2 ** 31) && numVal <= 2 ** 31 - 1) {
                    return ['int32', numVal];
                }
                if (numVal >= -(2 ** 63) && numVal <= 2 ** 63 - 1) {
                    return ['int64', numVal];
                }
                // If it is too big → double (even for integers)
                return ['double', numVal];
            }

            // If not integer → double
            return ['double', numVal];
        }

        if (attrType === 'Boolean') {
            return ['boolean', value];
        }

        if (['json', 'StructuredValue'].includes(attrType)) {
            try {
                return ['string', JSON.stringify(value)];
            } catch (err) {
                logger.warn(`Error serializing '${name}' as JSON: ${err}`);
                return ['string', String(value)];
            }
        }

        return ['string', value];
    }

    // Fallbacks
    if (['timeinstant', 'recvtime'].includes(nameLc)) {
        return ['string', String(value)];
    }

    if (isPossibleDatetime(value)) {
        try {
            return [{ type: 'int64', name: 'org.apache.kafka.connect.data.Timestamp' }, toEpochMillis(value)];
        } catch (err) {
            logger.warn(`Error parsing datetime for field '${name}': ${err}`);
            return ['string', String(value)];
        }
    }

    if (typeof value === 'boolean') {
        return ['boolean', value];
    }
    if (Number.isInteger(value)) {
        if (value >= -(2 ** 31) && value <= 2 ** 31 - 1) {
            return ['int32', value];
        }
        if (value >= -(2 ** 63) && value <= 2 ** 63 - 1) {
            return ['int64', value];
        }
        logger.warn(`Integer out of range BIGINT: ${value}`);
        return ['string', String(value)];
    }
    if (typeof value === 'number') {
        return ['double', value];
    }
    if (typeof value === 'object') {
        try {
            return ['string', JSON.stringify(value)];
        } catch (err) {
            logger.warn(`Error serializing '${name}' as JSON: ${err}`);
            return ['string', String(value)];
        }
    }
    return ['string', value];
}

// -----------------
// Kafka Schema Builder
// -----------------
function toKafnusConnectSchema(entity, schemaOverrides = {}, attributeTypes = {}) {
    const schemaFields = [];
    const payload = {};

    for (const [k, vRaw] of Object.entries(entity)) {
        if (schemaOverrides[k]) {
            schemaFields.push(schemaOverrides[k]);
            payload[k] = vRaw;
            continue;
        }

        if (['timeinstant', 'recvtime'].includes(k.toLowerCase())) {
            schemaFields.push({ field: k, type: 'string', optional: vRaw == null });
            payload[k] = String(vRaw);
            continue;
        }

        const attrType = attributeTypes[k];
        const [fieldType, v] = inferFieldType(k, vRaw, attrType);
        const isOptional = v == null;

        if (typeof fieldType === 'object') {
            schemaFields.push({ field: k, ...fieldType, optional: isOptional });
        } else {
            schemaFields.push({ field: k, type: fieldType, optional: isOptional });
        }
        payload[k] = v;
    }

    schemaFields.push({ field: 'recvtime', type: 'string', optional: false });
    payload.recvtime = formatDatetimeIso('UTC');

    return {
        schema: {
            type: 'struct',
            fields: schemaFields,
            optional: false
        },
        payload
    };
}

function buildKafkaKey(entity, keyFields, includeTimeinstant = false) {
    const fields = [];
    const payload = {};
    keyFields.forEach((k) => {
        fields.push({ field: k, type: 'string', optional: false });
        payload[k] = entity[k];
    });

    if (includeTimeinstant) {
        fields.push({ field: 'timeinstant', type: 'string', optional: false });
        payload.timeinstant = entity.timeinstant;
    }

    return Buffer.from(
        JSON.stringify({
            schema: { type: 'struct', fields, optional: false },
            payload
        }),
        'utf-8'
    );
}

// -----------------
// Mongo field encoding
// -----------------
function encodeMongo(value) {
    if (value === '/') {
        return 'x002f';
    }
    return value
        .replace(/\//g, 'x002f')
        .replace(/\./g, 'x002e')
        .replace(/\$/g, 'x0024')
        .replace(/"/g, 'x0022')
        .replace(/=/g, 'xffff');
}

exports.toWktGeometry = toWktGeometry;
exports.toWkbStructFromWkt = toWkbStructFromWkt;
exports.toKafnusConnectSchema = toKafnusConnectSchema;
exports.buildKafkaKey = buildKafkaKey;
exports.sanitizeTopic = sanitizeTopic;
exports.encodeMongo = encodeMongo;
exports.formatDatetimeIso = formatDatetimeIso;
exports.toEpochMillis = toEpochMillis;
exports.inferFieldType = inferFieldType;
