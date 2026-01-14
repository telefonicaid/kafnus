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
});
