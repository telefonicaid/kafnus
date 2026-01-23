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
*
* Authors: 
*  - Álvaro Vega
*  - Gregorio Blázquez
*  - Fermín Galán
*  - Oriana Romero
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
    if (!name) {
        return '';
    }
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
