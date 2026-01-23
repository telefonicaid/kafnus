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
*/

const client = require('prom-client');
const http = require('http');
const logger = require('./logger');

// Metrics definition
const messagesProcessed = new client.Counter({
    name: 'messages_processed_total',
    help: 'Processed messages total',
    labelNames: ['flow']
});

const processingTime = new client.Gauge({
    name: 'message_processing_time_seconds',
    help: 'Message processing time in seconds',
    labelNames: ['flow']
});

// Start admin server
function startAdminServer(logger, port = 8000) {
    const server = http.createServer(async (req, res) => {
        if (req.url === '/metrics' && req.method === 'GET') {
            res.setHeader('Content-Type', client.register.contentType);
            res.end(await client.register.metrics());
            return;
        }
        if (req.url === '/logLevel') {
            if (req.method === 'GET') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ level: logger.getLevel() }));
                return;
            }

            if (req.method === 'POST') {
                let body = '';
                req.on('data', (chunk) => (body += chunk));
                req.on('end', () => {
                    try {
                        const { level } = JSON.parse(body);

                        if (!level) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ error: 'Missing "level" field' }));
                            return;
                        }

                        logger.setLevel(level.toUpperCase());
                        logger.info(`Log level changed to: ${level}`);

                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ ok: true, level }));
                    } catch (err) {
                        res.statusCode = 400;
                        res.end(JSON.stringify({ error: 'Invalid JSON' }));
                    }
                });
                return;
            }
        }
        if (req.url === '/health' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ status: 'UP', timestamp: new Date().toISOString() }));
            return;
        }
        res.statusCode = 404;
        res.end();
    });

    server.listen(port, () => {
        logger.info(`Metrics server listening on http://localhost:${port}/metrics`);
        logger.info(`Log level endpoint enabled at http://localhost:${port}/logLevel`);
        logger.info(`Health check endpoint enabled at http://localhost:${port}/health`);
    });

    return server;
}

exports.startAdminServer = startAdminServer;
exports.messagesProcessed = messagesProcessed;
exports.processingTime = processingTime;
