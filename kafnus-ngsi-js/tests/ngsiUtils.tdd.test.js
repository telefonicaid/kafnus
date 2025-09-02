const {
    toWktGeometry,
    toWkbStructFromWkt,
    sanitizeTopic,
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
    describe('sanitizeTopic (TDD)', () => {
        test('removes leading/trailing slashes and normalizes', () => {
            expect(sanitizeTopic(' /Room.Temp/ ')).toBe('room_temp');
        });

        test('converts special characters to underscores', () => {
            expect(sanitizeTopic('My@Topic!')).toBe('my_topic_');
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

        // test("throws error on invalid date", () => {
        //   expect(() => toEpochMillis("invalid-date")).toThrow();
        // });
    });
});
