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
    /**
     * Converts a WKT geometry string to a Debezium-compatible WKB struct with schema and base64-encoded payload.
     * Used for sending geo attributes in Kafnus Connect format.
     */
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
    /**
     * Converts NGSI geo attributes (geo:point, geo:polygon, geo:json) to WKT string.
     * Supports extension for additional geo types if needed.
     */
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
function sanitizeString(name) {
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

    // 0. Null or undefined values: return string with null value
    if (value === null || value === undefined) {
        return ['string', null];
    }

    // 1. Handle special attribute types
    if (attrType) {
        // Geospatial types
        if (attrType == 'geo:json') {
            return ['geometry', value];
        }

        // DateTime and ISO8601 types
        if (attrType === 'DateTime' || attrType === 'ISO8601') {
            // Special case for timeinstant/recvtime: always treat as string
            // because they are processed specially in Kafnus-Connect sinks
            if (['timeinstant', 'recvtime'].includes(nameLc)) {
                return ['string', String(value)];
            }
            try {
                if (value == null) {
                    return ['string', null];
                }
                // Use Kafka Connect Timestamp logical type
                return [{ type: 'int64', name: 'org.apache.kafka.connect.data.Timestamp' }, toEpochMillis(value)];
            } catch (err) {
                logger.warn(`Error parsing datetime for field '${name}': ${err}`);
                return ['string', String(value)];
            }
        }
    }

    // 2. If not a special type, but value is a string → treat as string
    if (typeof value === 'string') {
        return ['string', value];
    }

    // 3. Fallback: infer type for other primitives
    if (typeof value === 'boolean') {
        return ['boolean', value];
    }

    // Number handling: return as double (type  in JS is always float64)
    if (typeof value === 'number') {
        return ['double', value];
    }

    // Objects: serialize to string (fallback)
    if (typeof value === 'object') {
        try {
            return ['string', JSON.stringify(value)];
        } catch (err) {
            logger.warn(`Error serializing '${name}' as JSON: ${err}`);
            return ['string', String(value)];
        }
    }

    // 4. All other cases: treat as string
    return ['string', String(value)];
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
    /**
     * Builds the Kafka message key with schema based on key_fields and optionally timeinstant.
     * This key is used for Kafnus Connect upsert mode or primary key definition.
     */
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
// Kafka Headers Extraction
// -----------------
function getFiwareContext(headers, fallbackEvent) {
    let service = null;
    let servicepath = null;
    if (headers && headers.length > 0) {
        const hdict = {};
        headers.forEach((headerObj) => {
            const headerName = Object.keys(headerObj)[0];
            const bufferValue = headerObj[headerName];
            const decodedValue = Buffer.from(bufferValue);
            hdict[headerName.toLowerCase()] = decodedValue.toString();
        });
        service = (hdict['fiware-service'] ? hdict['fiware-service'] : 'default').toLowerCase();
        servicepath = (hdict['fiware-servicepath'] ? hdict['fiware-servicepath'] : '/').toLowerCase();
    } else {
        const hdrs = fallbackEvent.headers ? fallbackEvent.headers : fallbackEvent;
        service = (hdrs['fiware-service'] ? hdrs['fiware-service'] : 'default').toLowerCase();
        servicepath = (hdrs['fiware-servicepath'] ? hdrs['fiware-servicepath'] : '/').toLowerCase();
    }
    if (!servicepath.startsWith('/')) {
        servicepath = '/' + servicepath;
    }
    return { service, servicepath };
}

// -----------------
// Mongo field encoding
// -----------------
function encodeMongo(value) {
    if (value === '/') {
        return 'x002f';
    }
    return value
        .replace(/x[0-9a-f]{4}/gi, (m) => 'xx' + m.slice(1)) // strings composed of a x character and a Unicode
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
exports.sanitizeString = sanitizeString;
exports.encodeMongo = encodeMongo;
exports.formatDatetimeIso = formatDatetimeIso;
exports.toEpochMillis = toEpochMillis;
exports.inferFieldType = inferFieldType;
exports.getFiwareContext = getFiwareContext;
