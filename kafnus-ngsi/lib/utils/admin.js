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

const client = require('prom-client');
const http = require('http');

const SERVICE_VERSION = process.env.npm_package_version || 'unknown';
const PROCESS_START_TIME_SECONDS = Math.floor(Date.now() / 1000);

const pipelineState = {
    totalEvents: 0,
    totalSuccessEvents: 0,
    totalErrorEvents: 0,
    flows: new Map(),
    services: new Map()
};

const adminState = {
    totalRequests: 0,
    totalErrorRequests: 0,
    inFlightRequests: 0,
    requestsByLabel: new Map(),
    lastRequestTimestamp: null
};

// Metrics definition
const processingTime = new client.Gauge({
    name: 'message_processing_time_seconds',
    help: 'Message processing time in seconds',
    labelNames: ['flow']
});

const messagesProcessedByService = new client.Counter({
    name: 'messages_processed_by_service_total',
    help: 'Processed messages grouped by flow and fiware service (tenant).',
    labelNames: ['flow', 'fiware_service', 'result']
});

const adminInFlightRequests = new client.Gauge({
    name: 'admin_http_server_in_flight_requests',
    help: 'Current in-flight requests in admin HTTP server.'
});

const adminRequestsTotal = new client.Counter({
    name: 'admin_http_server_requests_total',
    help: 'Total admin HTTP requests by method, route and status class.',
    labelNames: ['method', 'route', 'status_code', 'status_class']
});

const adminRequestDurationMs = new client.Histogram({
    name: 'admin_http_server_request_duration_ms',
    help: 'Admin HTTP request duration in milliseconds.',
    labelNames: ['method', 'route', 'status_class'],
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
});

const adminErrorsTotal = new client.Counter({
    name: 'admin_http_server_errors_total',
    help: 'Total admin HTTP requests ending with 4xx/5xx status.',
    labelNames: ['method', 'route', 'status_code', 'status_class']
});

const serviceInfo = new client.Gauge({
    name: 'kafnus_ngsi_service_info',
    help: 'Static runtime information for Kafnus NGSI admin server.',
    labelNames: ['version', 'node_version', 'environment']
});

adminInFlightRequests.set(0);
serviceInfo.set(
    {
        version: SERVICE_VERSION,
        node_version: process.version,
        environment: process.env.NODE_ENV || 'unknown'
    },
    1
);

function upsertFlowState(flow) {
    const existing = pipelineState.flows.get(flow);

    if (existing) {
        return existing;
    }

    const initial = {
        total: 0,
        success: 0,
        error: 0,
        totalDurationSeconds: 0,
        lastDurationSeconds: 0,
        lastProcessedAt: null
    };

    pipelineState.flows.set(flow, initial);
    return initial;
}

function upsertServiceState(service) {
    const existing = pipelineState.services.get(service);

    if (existing) {
        return existing;
    }

    const initial = {
        total: 0,
        success: 0,
        error: 0,
        lastProcessedAt: null
    };

    pipelineState.services.set(service, initial);
    return initial;
}

function recordFlowProcessing(flow, fiwareService, durationSeconds, result = 'success') {
    const normalizedFlow = flow || 'unknown';
    const normalizedService = fiwareService || 'default';
    const normalizedDurationSeconds = Number.isFinite(durationSeconds) ? Math.max(durationSeconds, 0) : 0;
    const normalizedResult = result === 'error' ? 'error' : 'success';

    messagesProcessedByService
        .labels({
            flow: normalizedFlow,
            fiware_service: normalizedService,
            result: normalizedResult
        })
        .inc();
    processingTime.labels({ flow: normalizedFlow }).set(normalizedDurationSeconds);

    const flowState = upsertFlowState(normalizedFlow);
    const serviceState = upsertServiceState(normalizedService);
    pipelineState.totalEvents += 1;
    flowState.total += 1;
    serviceState.total += 1;
    flowState.lastDurationSeconds = normalizedDurationSeconds;
    flowState.totalDurationSeconds += normalizedDurationSeconds;
    flowState.lastProcessedAt = new Date().toISOString();
    serviceState.lastProcessedAt = flowState.lastProcessedAt;

    if (normalizedResult === 'error') {
        pipelineState.totalErrorEvents += 1;
        flowState.error += 1;
        serviceState.error += 1;
        return;
    }

    pipelineState.totalSuccessEvents += 1;
    flowState.success += 1;
    serviceState.success += 1;
}

function buildPipelineSnapshot() {
    const byFlow = Array.from(pipelineState.flows.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([flow, data]) => ({
            flow,
            totalEvents: data.total,
            successEvents: data.success,
            errorEvents: data.error,
            lastDurationSeconds: data.lastDurationSeconds,
            avgDurationSeconds: data.total > 0 ? Number((data.totalDurationSeconds / data.total).toFixed(6)) : 0,
            lastProcessedAt: data.lastProcessedAt
        }));

    const successRate =
        pipelineState.totalEvents > 0
            ? Number((pipelineState.totalSuccessEvents / pipelineState.totalEvents).toFixed(6))
            : 1;

    return {
        totalEvents: pipelineState.totalEvents,
        successEvents: pipelineState.totalSuccessEvents,
        errorEvents: pipelineState.totalErrorEvents,
        successRate,
        activeServices: pipelineState.services.size,
        activeFlows: byFlow.length,
        byFlow
    };
}

function getMetricsContentType(acceptHeader) {
    const accept = acceptHeader || '';
    const defaultContentType = client.register.contentType;

    if (!accept || accept.includes('*/*') || accept.includes('text/plain') || accept.includes(defaultContentType)) {
        return {
            ok: true,
            contentType: defaultContentType
        };
    }

    return {
        ok: false
    };
}

function getStatusClass(statusCode) {
    const family = Math.floor(Number(statusCode || 0) / 100);
    return `${family}xx`;
}

function normalizeRoute(pathname) {
    if (pathname === '/metrics' || pathname === '/health' || pathname === '/logLevel') {
        return pathname;
    }

    return '__other__';
}

function getPathname(req) {
    try {
        return new URL(req.url, 'http://localhost').pathname;
    } catch (error) {
        return '/';
    }
}

function labelsKey(labels) {
    return `${labels.method}|${labels.route}|${labels.status_code}|${labels.status_class}`;
}

function registerRequestInState(labels) {
    const key = labelsKey(labels);
    const existing = adminState.requestsByLabel.get(key);

    if (existing) {
        existing.value += 1;
        return;
    }

    adminState.requestsByLabel.set(key, {
        labels,
        value: 1
    });
}

function onRequestStart() {
    adminState.inFlightRequests += 1;
    adminInFlightRequests.inc();
    return Date.now();
}

function onRequestFinish(req, res, startMs, route) {
    const durationMs = Math.max(0, Date.now() - startMs);
    const statusCode = String(res.statusCode || 0);
    const statusClass = getStatusClass(res.statusCode || 0);
    const method = req.method || 'UNKNOWN';
    const labels = {
        method,
        route,
        status_code: statusCode,
        status_class: statusClass
    };

    adminState.totalRequests += 1;
    adminState.inFlightRequests = Math.max(0, adminState.inFlightRequests - 1);
    adminState.lastRequestTimestamp = new Date().toISOString();
    adminInFlightRequests.set(adminState.inFlightRequests);

    registerRequestInState(labels);
    adminRequestsTotal.inc(labels);
    adminRequestDurationMs.observe(
        {
            method,
            route,
            status_class: statusClass
        },
        durationMs
    );

    if (Number(res.statusCode || 0) >= 400) {
        adminState.totalErrorRequests += 1;
        adminErrorsTotal.inc(labels);
    }
}

function buildHealthPayload(logger, port) {
    const memory = process.memoryUsage();
    const metricsCount = client.register.getMetricsAsArray().length;

    return {
        status: 'UP',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        service: {
            name: 'kafnus-ngsi',
            version: SERVICE_VERSION,
            nodeVersion: process.version,
            processStartTimeSeconds: PROCESS_START_TIME_SECONDS,
            environment: process.env.NODE_ENV || 'unknown'
        },
        process: {
            pid: process.pid,
            memory: {
                rssBytes: memory.rss,
                heapTotalBytes: memory.heapTotal,
                heapUsedBytes: memory.heapUsed
            }
        },
        admin: {
            port,
            logLevel: logger.getLevel(),
            endpoints: ['/metrics', '/health', '/logLevel']
        },
        pipeline: buildPipelineSnapshot(),
        metrics: {
            registryContentType: client.register.contentType,
            registeredMetrics: metricsCount
        }
    };
}

// Start admin server
function startAdminServer(logger, port = 8000) {
    const server = http.createServer(async (req, res) => {
        const route = normalizeRoute(getPathname(req));
        const startMs = onRequestStart();
        const originalEnd = res.end.bind(res);
        let finalized = false;

        res.end = (...args) => {
            if (!finalized) {
                finalized = true;
                onRequestFinish(req, res, startMs, route);
            }
            return originalEnd(...args);
        };

        try {
            if (route === '/metrics' && req.method === 'GET') {
                const contentNegotiation = getMetricsContentType(req.headers.accept);

                if (!contentNegotiation.ok) {
                    res.statusCode = 406;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(
                        JSON.stringify({
                            error: 'NotAcceptable',
                            description: 'Accept header must allow Prometheus text format (text/plain or */*)'
                        })
                    );
                    return;
                }

                res.setHeader('Content-Type', contentNegotiation.contentType);
                res.end(await client.register.metrics());
                return;
            }
            if (route === '/logLevel') {
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

                res.statusCode = 405;
                res.setHeader('Allow', 'GET, POST');
                res.end();
                return;
            }
            if (route === '/health' && req.method === 'GET') {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(buildHealthPayload(logger, port)));
                return;
            }

            res.statusCode = 404;
            res.end();
        } catch (error) {
            logger.error('Unhandled error in admin server request', error);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'InternalServerError' }));
        }
    });

    server.listen(port, () => {
        logger.info(`Metrics server listening on http://localhost:${port}/metrics`);
        logger.info(`Log level endpoint enabled at http://localhost:${port}/logLevel`);
        logger.info(`Health check endpoint enabled at http://localhost:${port}/health`);
    });

    return server;
}

exports.startAdminServer = startAdminServer;
exports.processingTime = processingTime;
exports.recordFlowProcessing = recordFlowProcessing;
exports.getMetricsContentType = getMetricsContentType;
exports.buildHealthPayload = buildHealthPayload;
