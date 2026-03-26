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

const {
    toWktGeometry,
    toWkbStructFromWkt,
    sanitizeString,
    encodeMongo,
    toEpochMillis,
    formatDatetimeIso,
    inferFieldType,
    getFiwareContext,
    truncate
} = require('../lib/utils/ngsiUtils');

jest.mock('../lib/utils/logger', () => ({
    getBasicLogger: () => ({
        error: (...args) => console.error(...args),
        warn: (...args) => console.warn(...args),
        info: (...args) => console.log(...args)
    })
}));

describe('ngsiUtils.js', () => {
    // -------------------
    // TDD STYLE TESTS
    // -------------------
    describe('sanitizeString (TDD)', () => {
        test('removes leading/trailing slashes and normalizes', () => {
            expect(sanitizeString(' /Room.Temp/ ')).toBe('room_temp');
        });

        test('converts special characters to underscores', () => {
            expect(sanitizeString('My@Topic!')).toBe('my_topic_');
        });
    });

    describe('encodeMongo (TDD)', () => {
        test('replaces / . $ =', () => {
            expect(encodeMongo('a/b.c$=')).toBe('ax002fbx002ecx0024xffff');
        });

        test("special case: '/' only", () => {
            expect(encodeMongo('/')).toBe('x002f');
        });
    });

    describe('toEpochMillis (TDD)', () => {
        test('converts ISO 8601 to epoch ms', () => {
            expect(toEpochMillis('2020-01-01T00:00:00Z')).toBe(1577836800000);
        });
    });

    describe('inferFieldType (TDD)', () => {
        test('for non-special attrType, arrays follow generic array inference', () => {
            const [schema, value] = inferFieldType('relatedTo', ['A:1', 'B:2'], 'MultiRelation');

            expect(schema).toEqual({ type: 'array', items: { type: 'string', optional: false } });
            expect(value).toEqual(['A:1', 'B:2']);
        });

        test('for non-special attrType, scalar string remains string', () => {
            const [schema, value] = inferFieldType('offers', 'Event:001', 'MultiRelation');

            expect(schema).toBe('string');
            expect(value).toBe('Event:001');
        });
    });

    describe('inferFieldType - additional branches (TDD)', () => {
        test('null value returns ["string", null]', () => {
            const [type, val] = inferFieldType('x', null);
            expect(type).toBe('string');
            expect(val).toBeNull();
        });

        test('undefined value returns ["string", null]', () => {
            const [type, val] = inferFieldType('x', undefined);
            expect(type).toBe('string');
            expect(val).toBeNull();
        });

        test('boolean value returns ["boolean", value]', () => {
            const [type, val] = inferFieldType('active', true);
            expect(type).toBe('boolean');
            expect(val).toBe(true);
        });

        test('non-integer number without attrType returns ["double", value]', () => {
            const [type, val] = inferFieldType('ratio', 3.14);
            expect(type).toBe('double');
            expect(val).toBe(3.14);
        });

        test('integer number without attrType returns ["double", value]', () => {
            const [type, val] = inferFieldType('count', 5);
            expect(type).toBe('double');
            expect(val).toBe(5);
        });

        test('Number attrType with decimal returns ["double", value]', () => {
            const [type, val] = inferFieldType('ratio', 3.14, 'Number');
            expect(type).toBe('double');
            expect(val).toBe(3.14);
        });

        test('geo:json attrType returns ["geometry", value]', () => {
            const geo = { type: 'Point', coordinates: [2, 41] };
            const [type, val] = inferFieldType('loc', geo, 'geo:json');
            expect(type).toBe('geometry');
            expect(val).toBe(geo);
        });

        test('DateTime attrType returns Kafka Connect timestamp schema', () => {
            const [type, val] = inferFieldType('ts', '2024-01-15T10:30:00.000Z', 'DateTime');
            expect(type).toEqual({ type: 'int64', name: 'org.apache.kafka.connect.data.Timestamp' });
            expect(typeof val).toBe('number');
        });

        test('DateTime with timeinstant name returns string passthrough', () => {
            const [type, val] = inferFieldType('TimeInstant', '2024-01-15T10:30:00.000Z', 'DateTime');
            expect(type).toBe('string');
            expect(val).toBe('2024-01-15T10:30:00.000Z');
        });

        test('DateTime with invalid value falls back to string', () => {
            const [type] = inferFieldType('ts', 'not-a-date', 'DateTime');
            expect(type).toBe('string');
        });

        test('empty array returns array schema with optional items', () => {
            const [schema, val] = inferFieldType('items', []);
            expect(schema.type).toBe('array');
            expect(val).toEqual([]);
        });

        test('all-numbers array returns array schema with double items', () => {
            const [schema, val] = inferFieldType('readings', [1.1, 2.2, 3.3]);
            expect(schema).toMatchObject({ type: 'array', items: { type: 'double' } });
            expect(val).toEqual([1.1, 2.2, 3.3]);
        });

        test('all-booleans array returns array schema with boolean items', () => {
            const [schema, val] = inferFieldType('flags', [true, false, true]);
            expect(schema).toMatchObject({ type: 'array', items: { type: 'boolean' } });
            expect(val).toEqual([true, false, true]);
        });

        test('mixed array returns JSON-serialised string', () => {
            const mixed = [1, 'two', true];
            const [type, val] = inferFieldType('mixed', mixed);
            expect(type).toBe('string');
            expect(val).toBe(JSON.stringify(mixed));
        });

        test('plain object returns JSON-serialised string', () => {
            const obj = { key: 'value', n: 42 };
            const [type, val] = inferFieldType('meta', obj);
            expect(type).toBe('string');
            expect(val).toBe(JSON.stringify(obj));
        });
    });

    describe('toWktGeometry (TDD)', () => {
        test('converts geo:polygon coordinate array to POLYGON WKT', () => {
            const coords = ['41.0,2.0', '41.5,2.5', '41.0,3.0', '41.0,2.0'];
            const result = toWktGeometry('geo:polygon', coords);
            expect(result).toMatch(/^POLYGON/);
            expect(result).toContain('2 41');
        });

        test('converts geo:json GeoJSON object to WKT', () => {
            const result = toWktGeometry('geo:json', { type: 'Point', coordinates: [2.0, 41.0] });
            expect(result).toMatch(/POINT/);
        });

        test('returns null for unsupported geo type', () => {
            expect(toWktGeometry('geo:unknown', 'anything')).toBeNull();
        });

        test('returns null on parse error (non-array polygon input)', () => {
            expect(toWktGeometry('geo:polygon', 'not-an-array')).toBeNull();
        });
    });

    describe('toWkbStructFromWkt (TDD)', () => {
        test('converts valid POINT WKT to WKB struct with schema and payload', () => {
            const result = toWkbStructFromWkt('POINT (2 41)', 'location');
            expect(result).not.toBeNull();
            expect(result.schema.type).toBe('struct');
            expect(result.payload.srid).toBe(4326);
            expect(typeof result.payload.wkb).toBe('string');
        });

        test('returns null on invalid WKT input', () => {
            expect(toWkbStructFromWkt('NOT A WKT', 'bad')).toBeNull();
        });
    });

    describe('getFiwareContext (TDD)', () => {
        test('extracts service, servicepath and datamodel from header array', () => {
            const headers = [
                { 'fiware-service': Buffer.from('MyService') },
                { 'fiware-servicepath': Buffer.from('/mypath') },
                { 'fiware-datamodel': Buffer.from('myModel') }
            ];
            const { service, servicepath, datamodel } = getFiwareContext(headers, {});
            expect(service).toBe('myservice');
            expect(servicepath).toBe('/mypath');
            expect(datamodel).toBe('myModel');
        });

        test('adds leading slash to servicepath when missing', () => {
            const headers = [
                { 'fiware-service': Buffer.from('svc') },
                { 'fiware-servicepath': Buffer.from('noslash') }
            ];
            const { servicepath } = getFiwareContext(headers, {});
            expect(servicepath).toBe('/noslash');
        });

        test('uses fallback event object when headers array is empty', () => {
            const fallback = { 'fiware-service': 'fallback-svc', 'fiware-servicepath': '/fallback' };
            const { service, servicepath } = getFiwareContext([], fallback);
            expect(service).toBe('fallback-svc');
            expect(servicepath).toBe('/fallback');
        });

        test('defaults service to "default" and servicepath to "/" when fallback is empty', () => {
            const { service, servicepath } = getFiwareContext([], {});
            expect(service).toBe('default');
            expect(servicepath).toBe('/');
        });
    });

    describe('encodeMongo (TDD)', () => {
        test('encodes dot character as x002e', () => {
            expect(encodeMongo('a.b')).toBe('ax002eb');
        });

        test('encodes dollar sign as x0024', () => {
            expect(encodeMongo('a$b')).toBe('ax0024b');
        });

        test('escapes existing xNNNN sequences to prevent collisions', () => {
            expect(encodeMongo('x002f')).toBe('xx002f');
        });
    });

    describe('truncate (TDD)', () => {
        test('returns short string unchanged', () => {
            expect(truncate('hello', 100)).toBe('hello');
        });

        test('truncates long string and appends notice', () => {
            const long = 'x'.repeat(200);
            const result = truncate(long, 100);
            expect(result.length).toBeLessThan(200);
            expect(result).toContain('[truncated');
        });

        test('returns falsy input as-is', () => {
            expect(truncate(null)).toBeNull();
            expect(truncate('')).toBe('');
        });
    });

    describe('formatDatetimeIso (TDD)', () => {
        test('returns a valid ISO 8601 datetime string', () => {
            const result = formatDatetimeIso('UTC');
            expect(typeof result).toBe('string');
            expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });
    });
});
