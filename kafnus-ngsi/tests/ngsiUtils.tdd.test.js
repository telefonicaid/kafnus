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
    toKafnusConnectSchema,
    buildKafkaKey
} = require('../lib/utils/ngsiUtils');

jest.mock('../lib/utils/logger', () => ({
    error: (...args) => console.error(...args),
    warn: (...args) => console.warn(...args),
    info: (...args) => console.log(...args)
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
        test('maps MultiRelation arrays to Kafka Connect array schema', () => {
            const [schema, value] = inferFieldType('relatedTo', ['A:1', 'B:2'], 'MultiRelation');

            expect(schema).toEqual({ type: 'array', items: { type: 'string' } });
            expect(value).toEqual(['A:1', 'B:2']);
        });

        test('normalizes scalar MultiRelation values to single-item arrays', () => {
            const [schema, value] = inferFieldType('offers', 'Event:001', 'MultiRelation');

            expect(schema).toEqual({ type: 'array', items: { type: 'string' } });
            expect(value).toEqual(['Event:001']);
        });
    });
});
