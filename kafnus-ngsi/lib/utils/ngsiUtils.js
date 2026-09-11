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

const { Geometry } = require('wkx');
const { Buffer } = require('node:buffer');
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

function isGeoJsonGeometry(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }

    if (typeof value.type !== 'string') {
        return false;
    }

    const validTypes = new Set(['point', 'multipoint', 'linestring', 'multilinestring', 'polygon', 'multipolygon']);

    if (!validTypes.has(value.type.toLowerCase())) {
        return false;
    }

    const hasCoordinates = Array.isArray(value.coordinates);
    const hasGeometries = Array.isArray(value.geometries);
    return hasCoordinates || hasGeometries;
}

function parseGeoJsonValue(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return isGeoJsonGeometry(parsed) ? parsed : null;
        } catch (err) {
            return null;
        }
    }

    return isGeoJsonGeometry(value) ? value : null;
}

function transformSgtrGeoJsonToWkt(entityObject) {
    if (!entityObject || typeof entityObject !== 'object') {
        return;
    }

    const asGeoJsonKey = Object.keys(entityObject).find((key) => key.toLowerCase() === 'asgeojson');
    if (!asGeoJsonKey) {
        return;
    }

    const rawGeoJson = entityObject[asGeoJsonKey];
    if (rawGeoJson === null || (typeof rawGeoJson === 'string' && rawGeoJson.trim().toLowerCase() === 'null')) {
        entityObject.asWkt = null;
        delete entityObject[asGeoJsonKey];
        return;
    }

    const geoJson = parseGeoJsonValue(rawGeoJson);
    if (!geoJson) {
        return;
    }

    try {
        entityObject.asWkt = geoJSONToWkt(geoJson);
        delete entityObject[asGeoJsonKey];
    } catch (err) {
        logger.warn(`Error transforming SGTR asGeoJSON to asWkt: ${err}`);
    }
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
function toEpochMillis(value) {
    return DateTime.fromISO(value, { zone: 'utc' }).toMillis();
}

function formatDatetimeIso(tz = 'UTC') {
    return DateTime.now().setZone(tz).toISO();
}

// -----------------
// NGSI entity / TimeInstant helpers
// -----------------
const TIMEINSTANT_KEY = 'timeinstant';
const RECVTIME_KEY = 'recvtime';

function isIgnoredAttr(name) {
    return ['id', 'type', 'alterationtype'].includes(name);
}

/**
 * Case-insensitive lookup of a `TimeInstant.value` inside an object. Reused for
 * both the entity-level attribute and per-attribute metadata, since IoT-Agent
 * casing may vary ('TimeInstant', 'timeinstant', ...).
 */
function findTimeInstantValue(source) {
    if (!source || typeof source !== 'object') {
        return undefined;
    }

    for (const [key, val] of Object.entries(source)) {
        if (key.toLowerCase() === TIMEINSTANT_KEY) {
            return val?.value;
        }
    }
    return undefined;
}

/**
 * Resolves the single TimeInstant an entity as a whole should carry, using the
 * same priority as splitting: per-attribute metadata first, then the
 * entity-level TimeInstant. Unlike splitting, this never produces more than
 * one row, so attributes are only trusted when they agree on one value.
 *
 * - Exactly one distinct per-attribute metadata value -> that value wins, even
 *   over a differing entity-level TimeInstant.
 * - Otherwise, an existing entity-level TimeInstant wins.
 * - Otherwise, nothing usable: `value` is `undefined`, and `ambiguous` tells
 *   the caller whether that's because 2+ attributes disagreed with nothing to
 *   break the tie (worth a warning) or because nothing was provided at all
 *   (expected in some deployments, worth only a debug note).
 */
function resolveEntityTimestamp(entity) {
    const attrValues = new Set();

    for (const [rawName, attrData] of Object.entries(entity)) {
        const attrName = rawName.toLowerCase();

        if (isIgnoredAttr(attrName) || attrName === TIMEINSTANT_KEY || attrName === RECVTIME_KEY) {
            continue;
        }

        const ts = findTimeInstantValue(attrData?.metadata);
        if (ts != null) {
            attrValues.add(ts);
        }
    }

    if (attrValues.size === 1) {
        return { value: [...attrValues][0], ambiguous: false };
    }

    const entityTimeInstant = findTimeInstantValue(entity);
    if (entityTimeInstant != null) {
        return { value: entityTimeInstant, ambiguous: false };
    }

    return { value: undefined, ambiguous: attrValues.size > 1 };
}

/**
 * Guarantees `entity` carries a usable TimeInstant, resolving it via
 * `resolveEntityTimestamp` and overriding a stale/absent one as needed.
 * Returns `entity` unchanged (same reference) when the resolved value already
 * matches what's there, so callers that don't need a correction pay nothing.
 *
 * When nothing is resolvable, falls back to `recvtime`: at `warn` level when
 * attributes disagreed with each other and there was no entity-level
 * TimeInstant to break the tie (a likely misconfiguration worth surfacing),
 * at `debug` level otherwise (nothing was ever provided, which is expected in
 * some deployments).
 */
function ensureEntityTimeInstant(entity, recvtime) {
    const resolved = resolveEntityTimestamp(entity);

    if (resolved.value != null) {
        if (resolved.value === findTimeInstantValue(entity)) {
            return entity;
        }
        return { ...entity, TimeInstant: { type: 'DateTime', value: resolved.value } };
    }

    if (resolved.ambiguous) {
        logger.warn(
            `Entity '${entity.id}' has attributes with disagreeing TimeInstant metadata and no ` +
                `entity-level TimeInstant to fall back to; using recvtime '${recvtime}' instead`
        );
    } else {
        logger.debug(`No TimeInstant found for entity '${entity.id}'; falling back to recvtime '${recvtime}'`);
    }

    return { ...entity, TimeInstant: { type: 'DateTime', value: recvtime } };
}

/**
 * Splits a single NGSI entity into one sub-entity per distinct resolved
 * TimeInstant, so the historic flow can write one row per observation time.
 * Data attributes are grouped by their resolved timestamp and each group
 * becomes a standalone NGSI-shaped entity (same ignored attrs: id/type/
 * alterationtype, carried through verbatim) whose TimeInstant is overridden
 * with that group's resolved value, so the historic row carries the actual
 * observation time of the data it contains.
 *
 * This is purely mechanical grouping: it never invents a timestamp. A group
 * whose attributes resolve no TimeInstant at all (neither their own metadata
 * nor an entity-level one) simply has no TimeInstant — pair with
 * `ensureEntityTimeInstant` (via `KAFNUS_NGSI_ENSURE_TIMEINSTANT`) if a guaranteed
 * fallback to `recvtime` is also wanted.
 *
 * A `recvtime` data attribute (a provided measurement, see #299) is excluded
 * from grouping and replicated verbatim onto every produced sub-entity, since
 * all of them originate from the same notification.
 *
 * An attribute-less entity has nothing to group, but must still emit its row
 * like the non-split path does. In every other case the entity is rebuilt so
 * each row carries its resolved observation time — including when a single
 * shared metadata timestamp differs from the entity-level TimeInstant.
 */
function splitEntityByTimeInstant(entity) {
    const entityTimeInstant = findTimeInstantValue(entity);
    const groups = new Map();
    let recvtimeEntry = null;

    for (const [rawName, attrData] of Object.entries(entity)) {
        const attrName = rawName.toLowerCase();

        if (isIgnoredAttr(attrName) || attrName === TIMEINSTANT_KEY) {
            continue;
        }

        if (attrName === RECVTIME_KEY) {
            recvtimeEntry = [rawName, attrData];
            continue;
        }

        const ts = findTimeInstantValue(attrData?.metadata) ?? entityTimeInstant;
        const groupKey = toGroupKey(ts);

        if (!groups.has(groupKey)) {
            groups.set(groupKey, { ts, attrs: {} });
        }
        groups.get(groupKey).attrs[rawName] = attrData;
    }

    const groupList = Array.from(groups.values());

    // An attribute-less entity has nothing to group, but must still emit its
    // row like the non-split path — mapping an empty list would drop it.
    if (groupList.length === 0) {
        return [entity];
    }

    const ignoredEntries = Object.entries(entity).filter(([a]) => isIgnoredAttr(a.toLowerCase()));

    return groupList.map(({ ts, attrs }) => {
        const subEntity = {
            ...Object.fromEntries(ignoredEntries),
            ...(recvtimeEntry ? { [recvtimeEntry[0]]: recvtimeEntry[1] } : {}),
            ...attrs
        };
        if (ts != null) {
            subEntity.TimeInstant = { type: 'DateTime', value: ts };
        }
        return subEntity;
    });
}

/**
 * Builds the Map key used to group attributes by resolved TimeInstant.
 * Different ISO representations of the same instant (e.g. a trailing 'Z' vs.
 * an explicit '+00:00' offset) must land in the same group, so the key is the
 * epoch-millis value rather than the raw string, wherever that's parseable.
 */
function toGroupKey(ts) {
    if (ts == null) {
        return '';
    }
    const millis = toEpochMillis(ts);
    return Number.isNaN(millis) ? ts : millis;
}

// -----------------
// Type inference
// -----------------

function normalizeType(attrType) {
    return typeof attrType === 'string' ? attrType.toLowerCase() : '';
}

function isNull(value) {
    return value === null || value === undefined;
}

function handleSpecialTypes(nameLc, value, attrTypeLc) {
    if (!attrTypeLc) {
        return null;
    }

    if (attrTypeLc === 'geo:json') {
        return ['geometry', value];
    }

    if (attrTypeLc === 'datetime' || attrTypeLc === 'iso8601') {
        return handleDateType(nameLc, value);
    }

    return null;
}

function handleDateType(nameLc, value) {
    if (isSpecialDateField(nameLc)) {
        return ['string', String(value)];
    }

    if (value == null) {
        return ['string', null];
    }

    try {
        const millis = toEpochMillis(value);

        if (Number.isNaN(millis)) {
            return warnInvalidDate(nameLc, value);
        }

        return [{ type: 'int64', name: 'org.apache.kafka.connect.data.Timestamp' }, millis];
    } catch (err) {
        return warnDateError(nameLc, err, value);
    }
}

function isSpecialDateField(nameLc) {
    return nameLc === 'timeinstant' || nameLc === 'recvtime';
}

function warnInvalidDate(name, value) {
    logger.warn(`Invalid datetime value for field '${name}': '${value}'`);
    return ['string', String(value)];
}

function warnDateError(name, err, value) {
    logger.warn(`Error parsing datetime for field '${name}': ${err}`);
    return ['string', String(value)];
}

function inferPrimitive(value) {
    switch (typeof value) {
        case 'string':
            return ['string', value];

        case 'boolean':
            return ['boolean', value];

        case 'number':
            return ['double', value];

        default:
            return null;
    }
}

function inferObject(name, value) {
    if (typeof value !== 'object') {
        return ['string', String(value)];
    }

    try {
        return ['string', JSON.stringify(value)];
    } catch (err) {
        logger.warn(`Error serializing '${name}' as JSON: ${err}`);
        return ['string', String(value)];
    }
}

function inferFieldType(name, value, attrType = null) {
    const nameLc = name.toLowerCase();
    const attrTypeLc = normalizeType(attrType);

    if (isNull(value)) {
        return ['string', null];
    }

    const special = handleSpecialTypes(nameLc, value, attrTypeLc);
    if (special) {
        return special;
    }

    const primitive = inferPrimitive(value);
    if (primitive) {
        return primitive;
    }

    return inferObject(name, value);
}

// -----------------
// Kafka Schema Builder
// -----------------
function toKafnusConnectSchema(entity, schemaOverrides = {}, attributeTypes = {}, recvtime = formatDatetimeIso('UTC')) {
    const schemaFields = [];
    const payload = {};
    const seenFields = new Set();

    const addSchemaField = (fieldDef) => {
        const fieldName = fieldDef.field.toLowerCase();

        if (seenFields.has(fieldName)) {
            return;
        }

        seenFields.add(fieldName);
        schemaFields.push(fieldDef);
    };

    for (const [k, vRaw] of Object.entries(entity)) {
        if (schemaOverrides[k]) {
            addSchemaField(schemaOverrides[k]);
            payload[k] = vRaw;
            continue;
        }

        if (['timeinstant', 'recvtime'].includes(k.toLowerCase())) {
            addSchemaField({
                field: k,
                type: 'string',
                optional: vRaw == null
            });
            payload[k] = String(vRaw);
            continue;
        }

        const attrType = attributeTypes[k];
        const [fieldType, v] = inferFieldType(k, vRaw, attrType);
        const isOptional = v == null;

        if (typeof fieldType === 'object') {
            addSchemaField({
                field: k,
                ...fieldType,
                optional: isOptional
            });
        } else {
            addSchemaField({
                field: k,
                type: fieldType,
                optional: isOptional
            });
        }

        payload[k] = v;
    }

    if (!seenFields.has('recvtime')) {
        addSchemaField({
            field: 'recvtime',
            type: 'string',
            optional: false
        });

        payload.recvtime = recvtime;
    }

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
        const hasTimeinstant = entity.timeinstant != null;
        fields.push({ field: 'timeinstant', type: 'string', optional: !hasTimeinstant });
        if (hasTimeinstant) {
            payload.timeinstant = entity.timeinstant;
        }
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
function normalizeService(service) {
    return (service || 'default').toLowerCase();
}

function normalizeServicePath(path) {
    let servicepath = (path || '/').toLowerCase();

    if (!servicepath.startsWith('/')) {
        servicepath = '/' + servicepath;
    }

    return servicepath;
}

function extractFallbackHeaders(fallbackEvent) {
    return fallbackEvent.headers || fallbackEvent || {};
}

function buildHeaderDict(headers) {
    const dict = {};

    headers.forEach((headerObj) => {
        const key = Object.keys(headerObj)[0];
        const value = headerObj[key];

        dict[key.toLowerCase()] = Buffer.from(value).toString();
    });

    return dict;
}

function hasHeaders(headers) {
    return Array.isArray(headers) && headers.length > 0;
}

function getFiwareContext(headers, fallbackEvent) {
    const source = hasHeaders(headers) ? buildHeaderDict(headers) : extractFallbackHeaders(fallbackEvent);

    const service = normalizeService(source['fiware-service']);
    const servicepath = normalizeServicePath(source['fiware-servicepath']);

    return {
        service,
        servicepath,
        datamodel: source['fiware-datamodel'] || null,
        correlator: source['fiware-correlator'] || null,
        graphname: source.graphname ?? null
    };
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

function truncate(s, max = 4000) {
    if (!s || s.length <= max) {
        return s;
    }
    return s.slice(0, max) + `... [truncated ${s.length - max} chars]`;
}

exports.truncate = truncate;
exports.isIgnoredAttr = isIgnoredAttr;
exports.ensureEntityTimeInstant = ensureEntityTimeInstant;
exports.splitEntityByTimeInstant = splitEntityByTimeInstant;
exports.toWktGeometry = toWktGeometry;
exports.toWkbStructFromWkt = toWkbStructFromWkt;
exports.transformSgtrGeoJsonToWkt = transformSgtrGeoJsonToWkt;
exports.toKafnusConnectSchema = toKafnusConnectSchema;
exports.buildKafkaKey = buildKafkaKey;
exports.sanitizeString = sanitizeString;
exports.encodeMongo = encodeMongo;
exports.formatDatetimeIso = formatDatetimeIso;
exports.toEpochMillis = toEpochMillis;
exports.inferFieldType = inferFieldType;
exports.getFiwareContext = getFiwareContext;
