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

function requestJson(port, method, path, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : null;
        const headers = payload
            ? {
                  'Content-Type': 'application/json',
                  'Content-Length': Buffer.byteLength(payload)
              }
            : {};

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

describe('admin.js runtime config endpoint', () => {
    const originalEnv = { ...process.env };

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
});
