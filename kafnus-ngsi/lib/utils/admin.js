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
