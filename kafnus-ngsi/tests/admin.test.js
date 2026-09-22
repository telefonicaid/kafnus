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

const http = require('http');
const client = require('prom-client');

function createLoggerMock(initialLevel = 'INFO') {
    let level = initialLevel;

    return {
        getLevel: jest.fn(() => level),
        setLevel: jest.fn((newLevel) => {
            level = newLevel;
        }),
        info: jest.fn(),
        error: jest.fn()
    };
}

function requestJson(port, method, path, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = {
            ...(payload
                ? {
                      'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(payload)
                  }
                : {}),
            ...extraHeaders
        };

        const req = http.request(
            {
                method,
                hostname: '127.0.0.1',
                port,
                path,
                headers
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        body: data ? JSON.parse(data) : null,
                        headers: res.headers
                    });
                });
            }
        );

        req.on('error', reject);

        if (payload) {
            req.write(payload);
        }

        req.end();
    });
}

function requestRaw(port, method, path, rawBody, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(rawBody || ''),
            ...extraHeaders
        };

        const req = http.request(
            {
                method,
                hostname: '127.0.0.1',
                port,
                path,
                headers
            },
            (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        body: data,
                        headers: res.headers
                    });
                });
            }
        );

        req.on('error', reject);

        if (rawBody) {
            req.write(rawBody);
        }

        req.end();
    });
}

describe('admin.js runtime config endpoint', () => {
    const originalEnv = { ...process.env };

    let startAdminServer;
    let recordFlowProcessing;
    let logger;
    let server;
    let port;

    beforeAll(() => {
        ({ startAdminServer, recordFlowProcessing } = require('../lib/utils/admin'));
    });

    beforeEach(async () => {
        logger = createLoggerMock();
        server = startAdminServer(logger, 0);
        await new Promise((resolve) => server.once('listening', resolve));
        port = server.address().port;
    });

    afterEach(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }

        process.env = { ...originalEnv };
    });

    test('GET /config returns KAFNUS vars and masks sensitive values', async () => {
        process.env.KAFNUS_NGSI_TEST_VISIBLE = 'visible-value';
        process.env.KAFNUS_NGSI_TEST_PASSWORD = 'secret-value';

        const response = await requestJson(port, 'GET', '/config');

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('variables');
        expect(response.body.variables.KAFNUS_NGSI_TEST_VISIBLE).toBe('visible-value');
        expect(response.body.variables.KAFNUS_NGSI_TEST_PASSWORD).toBe('***redacted***');
        expect(response.body).not.toHaveProperty('writeEnabled');
    });

    test('PATCH /config returns 405 Method Not Allowed', async () => {
        const response = await requestJson(port, 'PATCH', '/config', {
            updates: { KAFNUS_NGSI_LOG_LEVEL: 'DEBUG' }
        });

        expect(response.statusCode).toBe(405);
    });

    test('GET /health includes /config endpoint', async () => {
        const response = await requestJson(port, 'GET', '/health');

        expect(response.statusCode).toBe(200);
        expect(response.body.admin.endpoints).toEqual(
            expect.arrayContaining(['/metrics', '/health', '/logLevel', '/config'])
        );
    });

    test('GET /config masks all sensitive key patterns and filters unrelated vars', async () => {
        process.env.KAFNUS_NGSI_TEST_SECRET = 'a';
        process.env.KAFNUS_NGSI_TEST_TOKEN = 'b';
        process.env.KAFNUS_NGSI_TEST_PRIVATE_KEY = 'c';
        process.env.KAFNUS_NGSI_TEST_SASL_PASSWORD = 'd';
        process.env.SOME_UNRELATED_VAR = 'visible-but-not-exposed';

        const response = await requestJson(port, 'GET', '/config');

        expect(response.body.variables.KAFNUS_NGSI_TEST_SECRET).toBe('***redacted***');
        expect(response.body.variables.KAFNUS_NGSI_TEST_TOKEN).toBe('***redacted***');
        expect(response.body.variables.KAFNUS_NGSI_TEST_PRIVATE_KEY).toBe('***redacted***');
        expect(response.body.variables.KAFNUS_NGSI_TEST_SASL_PASSWORD).toBe('***redacted***');
        expect(response.body.variables).not.toHaveProperty('SOME_UNRELATED_VAR');
    });
});

describe('admin.js /metrics endpoint', () => {
    let startAdminServer;
    let logger;
    let server;
    let port;

    beforeAll(() => {
        ({ startAdminServer } = require('../lib/utils/admin'));
    });

    beforeEach(async () => {
        logger = createLoggerMock();
        server = startAdminServer(logger, 0);
        await new Promise((resolve) => server.once('listening', resolve));
        port = server.address().port;
    });

    afterEach(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test('GET /metrics returns 200 with Prometheus content type and known metric', async () => {
        const response = await requestRaw(port, 'GET', '/metrics');

        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toBe(client.register.contentType);
        expect(response.body).toContain('message_processing_time_seconds');
    });

    test('GET /metrics with unsupported Accept header returns 406', async () => {
        const response = await requestJson(port, 'GET', '/metrics', null, { Accept: 'application/xml' });

        expect(response.statusCode).toBe(406);
        expect(response.body).toEqual({
            error: 'NotAcceptable',
            description: 'Accept header must allow Prometheus text format (text/plain or */*)'
        });
    });
});

describe('admin.js /logLevel endpoint', () => {
    let startAdminServer;
    let logger;
    let server;
    let port;

    beforeAll(() => {
        ({ startAdminServer } = require('../lib/utils/admin'));
    });

    beforeEach(async () => {
        logger = createLoggerMock();
        server = startAdminServer(logger, 0);
        await new Promise((resolve) => server.once('listening', resolve));
        port = server.address().port;
    });

    afterEach(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test('GET /logLevel returns current level', async () => {
        const response = await requestJson(port, 'GET', '/logLevel');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ level: 'INFO' });
    });

    test('POST /logLevel with valid level changes it and returns ok', async () => {
        const response = await requestJson(port, 'POST', '/logLevel', { level: 'debug' });

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ ok: true, level: 'DEBUG' });
        expect(logger.setLevel).toHaveBeenCalledWith('DEBUG');
        expect(logger.info).toHaveBeenCalledWith('Log level changed to: DEBUG');
    });

    test('POST /logLevel without level field returns 400', async () => {
        const response = await requestJson(port, 'POST', '/logLevel', {});

        expect(response.statusCode).toBe(400);
        expect(response.body).toEqual({ error: 'Missing "level" field' });
    });

    test('POST /logLevel with invalid JSON body returns 400', async () => {
        const response = await requestRaw(port, 'POST', '/logLevel', 'not-json{');

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toEqual({ error: 'Invalid JSON' });
    });

    test('DELETE /logLevel returns 405 with Allow header', async () => {
        const response = await requestJson(port, 'DELETE', '/logLevel');

        expect(response.statusCode).toBe(405);
        expect(response.headers.allow).toBe('GET, POST');
    });
});

describe('admin.js unknown routes and error handling', () => {
    let startAdminServer;
    let logger;
    let server;
    let port;

    beforeAll(() => {
        ({ startAdminServer } = require('../lib/utils/admin'));
    });

    beforeEach(async () => {
        logger = createLoggerMock();
        server = startAdminServer(logger, 0);
        await new Promise((resolve) => server.once('listening', resolve));
        port = server.address().port;
    });

    afterEach(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test('GET on unknown route returns 404', async () => {
        const response = await requestJson(port, 'GET', '/does-not-exist');

        expect(response.statusCode).toBe(404);
    });

    test('unhandled error in route handler returns 500 InternalServerError', async () => {
        logger.getLevel = jest.fn(() => {
            throw new Error('boom');
        });

        const response = await requestJson(port, 'GET', '/logLevel');

        expect(response.statusCode).toBe(500);
        expect(response.body).toEqual({ error: 'InternalServerError' });
        expect(logger.error).toHaveBeenCalledWith('Unhandled error in admin server request', expect.any(Error));
    });
});

describe('admin.js recordFlowProcessing pipeline snapshot', () => {
    let startAdminServer;
    let recordFlowProcessing;
    let logger;
    let server;
    let port;

    beforeAll(() => {
        ({ startAdminServer, recordFlowProcessing } = require('../lib/utils/admin'));
    });

    beforeEach(async () => {
        logger = createLoggerMock();
        server = startAdminServer(logger, 0);
        await new Promise((resolve) => server.once('listening', resolve));
        port = server.address().port;
    });

    afterEach(async () => {
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test('records success and error events and reflects them in /health pipeline snapshot', async () => {
        const flow = `test-flow-${Date.now()}`;

        recordFlowProcessing(flow, 'tenant-a', 1.5, 'success');
        recordFlowProcessing(flow, 'tenant-a', 2.5, 'error');

        const response = await requestJson(port, 'GET', '/health');
        const flowSnapshot = response.body.pipeline.byFlow.find((entry) => entry.flow === flow);

        expect(flowSnapshot).toBeDefined();
        expect(flowSnapshot.totalEvents).toBe(2);
        expect(flowSnapshot.successEvents).toBe(1);
        expect(flowSnapshot.errorEvents).toBe(1);
        expect(response.body.pipeline.totalEvents).toBeGreaterThanOrEqual(2);
    });

    test('normalizes missing flow/service to unknown/default', async () => {
        recordFlowProcessing(undefined, undefined, 1, 'success');

        const response = await requestJson(port, 'GET', '/health');
        const flowSnapshot = response.body.pipeline.byFlow.find((entry) => entry.flow === 'unknown');

        expect(flowSnapshot).toBeDefined();
    });

    test('normalizes non-finite duration to 0', async () => {
        const flow = `test-flow-nan-${Date.now()}`;

        recordFlowProcessing(flow, 'tenant-b', NaN, 'success');

        const response = await requestJson(port, 'GET', '/health');
        const flowSnapshot = response.body.pipeline.byFlow.find((entry) => entry.flow === flow);

        expect(flowSnapshot.lastDurationSeconds).toBe(0);
    });
});
