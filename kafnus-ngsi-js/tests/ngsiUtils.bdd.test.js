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
    error: () => {},
    warn: (...args) => console.warn(...args),
    info: (...args) => console.log(...args)
}));

describe('ngsiUtils.js', () => {
    describe('toWktGeometry (BDD)', () => {
        test('Given a geo:point string, When converting, Then returns valid POINT WKT', () => {
            const wkt = toWktGeometry('geo:point', '40.4,-3.7');
            expect(wkt).toBe('POINT (-3.7 40.4)');
        });

        test('Given a geo:polygon array, When converting, Then returns valid POLYGON WKT', () => {
            const wkt = toWktGeometry('geo:polygon', ['40.4,-3.7', '41,-3.5', '40.5,-3.6']);
            expect(wkt).toMatch(/^POLYGON/);
        });

        test('Given an unknown type, When converting, Then returns null', () => {
            expect(toWktGeometry('geo:circle', '40.4,-3.7')).toBeNull();
        });
    });

    describe('toWkbStructFromWkt (BDD)', () => {
        test('Given a valid POINT WKT, When converting, Then returns struct with wkb + srid', () => {
            const result = toWkbStructFromWkt('POINT (10 20)', 'location');
            expect(result.schema.field).toBe('location');
            expect(result.payload.srid).toBe(4326);
            expect(typeof result.payload.wkb).toBe('string'); // base64
        });

        test('Given invalid WKT, When converting, Then returns null', () => {
            expect(toWkbStructFromWkt('INVALID', 'loc')).toBeNull();
        });
    });

    describe('inferFieldType (BDD)', () => {
        test("Given attrType Float, When parsing '3.14', Then returns float type", () => {
            const [t, v] = inferFieldType('temp', '3.14', 'Float');
            expect(t).toBe('float');
            expect(v).toBeCloseTo(3.14);
        });

        test('Given attrType Number with int32, When parsing, Then returns int32', () => {
            const [t, v] = inferFieldType('count', 100, 'Number');
            expect(t).toBe('int32');
            expect(v).toBe(100);
        });

        test('Given DateTime string, When parsing, Then returns Kafka Timestamp type', () => {
            const [t, v] = inferFieldType('ts', '2020-01-01T00:00:00Z', 'DateTime');
            expect(typeof t).toBe('object');
            expect(t.type).toBe('int64');
            expect(typeof v).toBe('number');
        });
    });

    describe('toKafnusConnectSchema (BDD)', () => {
        test('Given a simple entity, When building schema, Then payload includes recvtime', () => {
            const entity = { temperature: 21.5 };
            const result = toKafnusConnectSchema(entity, {}, { temperature: 'Float' });

            expect(result.schema.fields.some((f) => f.field === 'temperature')).toBe(true);
            expect(result.payload).toHaveProperty('recvtime');
        });
    });

    describe('buildKafkaKey (BDD)', () => {
        test('Given entity id, When building key, Then result is Buffer JSON with schema+payload', () => {
            const entity = { id: 'abc', type: 'Device', timeinstant: '2020-01-01T00:00:00Z' };
            const buf = buildKafkaKey(entity, ['id', 'type'], true);
            const parsed = JSON.parse(buf.toString('utf-8'));

            expect(parsed.payload.id).toBe('abc');
            expect(parsed.payload.type).toBe('Device');
            expect(parsed.payload).toHaveProperty('timeinstant');
        });
    });
});
