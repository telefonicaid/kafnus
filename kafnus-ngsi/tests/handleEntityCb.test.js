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

const { EventEmitter } = require('events');

const QUEUE_FULL = 'ERR__QUEUE_FULL';

jest.mock('@confluentinc/kafka-javascript', () => ({
    CODES: {
        ERRORS: {
            ERR__QUEUE_FULL: QUEUE_FULL
        }
    }
}));

jest.mock('../kafnusConfig', () => ({
    config: {
        ngsi: {
            prefix: 'smc_'
        }
    }
}));

jest.mock('../lib/utils/ngsiUtils', () => ({
    toWktGeometry: jest.fn(),
    toWkbStructFromWkt: jest.fn(),
    toKafnusConnectSchema: jest.fn(),
    buildKafkaKey: jest.fn(),
    sanitizeString: jest.fn((value) =>
        String(value || '')
            .replace(/^\/+|\/+$/g, '')
            .toLowerCase()
    ),
    getFiwareContext: jest.fn()
}));

const ngsiUtils = require('../lib/utils/ngsiUtils');
const { safeProduce, handleEntityCb } = require('../lib/utils/handleEntityCb');

describe('handleEntityCb.js', () => {
    let logger;

    beforeEach(() => {
        jest.clearAllMocks();

        logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        };

        ngsiUtils.getFiwareContext.mockReturnValue({
            service: 'myservice',
            servicepath: '/public',
            datamodel: 'myModel'
        });

        ngsiUtils.toWktGeometry.mockReturnValue('POINT (-3.7 40.4)');
        ngsiUtils.toWkbStructFromWkt.mockReturnValue({
            schema: {
                field: 'location',
                type: 'struct',
                fields: [
                    { field: 'wkb', type: 'bytes' },
                    { field: 'srid', type: 'int32' }
                ],
                optional: false
            },
            payload: {
                wkb: 'AQIAAA==',
                srid: 4326
            }
        });

        ngsiUtils.toKafnusConnectSchema.mockReturnValue({
            schema: { type: 'struct', fields: [] },
            payload: { entityid: 'Room:001' }
        });

        ngsiUtils.buildKafkaKey.mockReturnValue(Buffer.from('key-buffer', 'utf-8'));
    });

    describe('safeProduce', () => {
        test('retries once when queue is full and succeeds after delivery report', async () => {
            const producer = new EventEmitter();
            producer.produce = jest
                .fn()
                .mockImplementationOnce(() => {
                    const err = new Error('queue full');
                    err.code = QUEUE_FULL;
                    throw err;
                })
                .mockImplementation(() => {});

            setTimeout(() => {
                producer.emit('delivery-report');
            }, 5);

            await safeProduce(producer, ['topic-a'], { maxWaitMs: 200 });

            expect(producer.produce).toHaveBeenCalledTimes(2);
        });

        test('throws queue full error if retry window expires', async () => {
            const producer = new EventEmitter();
            producer.produce = jest.fn(() => {
                const err = new Error('queue full');
                err.code = QUEUE_FULL;
                throw err;
            });

            await expect(safeProduce(producer, ['topic-a'], { maxWaitMs: 25 })).rejects.toThrow('queue full');
        });
    });

    describe('handleEntityCb', () => {
        test('logs warning and skips processing when payload has no entities', async () => {
            const producer = { produce: jest.fn() };

            await handleEntityCb(logger, JSON.stringify({ data: [] }), { headers: [] }, producer);

            expect(logger.warn).toHaveBeenCalledWith('No entities found in payload');
            expect(producer.produce).not.toHaveBeenCalled();
        });

        test('builds message and publishes entity with expected topic and headers', async () => {
            const producer = { produce: jest.fn() };

            const rawValue = JSON.stringify({
                data: [
                    {
                        id: 'Room:001',
                        type: 'Room',
                        temperature: { value: 23.4, type: 'Number' },
                        metadata: { value: { source: 'sensorA' }, type: 'json' },
                        location: { value: '40.4,-3.7', type: 'geo:point' }
                    }
                ]
            });

            await handleEntityCb(
                logger,
                rawValue,
                {
                    headers: [{ 'fiware-service': Buffer.from('myservice') }],
                    suffix: '_processed',
                    flowSuffix: '_lastdata',
                    includeTimeinstant: false,
                    keyFields: ['entityid']
                },
                producer
            );

            expect(producer.produce).toHaveBeenCalledTimes(1);

            const [topic, partition, payloadBuf, keyBuf, timestamp, opaque, headersOut] =
                producer.produce.mock.calls[0];

            expect(topic).toBe('smc_myservice_processed');
            expect(partition).toBeNull();
            expect(JSON.parse(payloadBuf.toString('utf-8'))).toEqual({
                schema: { type: 'struct', fields: [] },
                payload: { entityid: 'Room:001' }
            });
            expect(keyBuf.toString('utf-8')).toBe('key-buffer');
            expect(typeof timestamp).toBe('number');
            expect(opaque).toBeNull();
            expect(headersOut).toEqual(
                expect.arrayContaining([
                    { 'fiware-service': Buffer.from('myservice') },
                    { 'fiware-servicepath': Buffer.from('public') },
                    { 'fiware-datamodel': Buffer.from('myModel') },
                    { entityType: Buffer.from('room') },
                    { entityId: Buffer.from('room:001') },
                    { suffix: Buffer.from('_lastdata') }
                ])
            );

            expect(ngsiUtils.toWktGeometry).toHaveBeenCalledWith('geo:point', '40.4,-3.7');
            expect(ngsiUtils.toWkbStructFromWkt).toHaveBeenCalledWith('POINT (-3.7 40.4)', 'location');
            expect(ngsiUtils.toKafnusConnectSchema).toHaveBeenCalled();
            expect(ngsiUtils.buildKafkaKey).toHaveBeenCalled();
            expect(logger.info).toHaveBeenCalled();
        });

        test('logs and rethrows non-queue producer errors', async () => {
            const producer = {
                produce: jest.fn(() => {
                    throw new Error('producer failure');
                })
            };

            const rawValue = JSON.stringify({
                data: [
                    {
                        id: 'Room:001',
                        type: 'Room',
                        temperature: { value: 1, type: 'Number' }
                    }
                ]
            });

            await expect(handleEntityCb(logger, rawValue, { headers: [] }, producer)).rejects.toThrow(
                'producer failure'
            );

            test('rethrows ERR__QUEUE_FULL from safeProduce without calling logger.error', async () => {
                // Make deadline expire immediately on the second Date.now() call so safeProduce
                // throws QUEUE_FULL synchronously; handleEntityCb must rethrow it without logging.
                let nowCount = 0;
                const baseTime = Date.now();
                const dateSpy = jest
                    .spyOn(Date, 'now')
                    .mockImplementation(() => (nowCount++ === 0 ? baseTime : baseTime + 30001));
                try {
                    const producer = new EventEmitter();
                    producer.produce = jest.fn(() => {
                        const err = new Error('queue full');
                        err.code = QUEUE_FULL;
                        throw err;
                    });

                    const rawValue = JSON.stringify({ data: [{ id: 'Room:001', type: 'Room' }] });

                    await expect(handleEntityCb(logger, rawValue, { headers: [] }, producer)).rejects.toMatchObject({
                        code: QUEUE_FULL
                    });
                    expect(logger.error).not.toHaveBeenCalled();
                } finally {
                    dateSpy.mockRestore();
                }
            });
            expect(logger.error).toHaveBeenCalled();
        });
    });
});
