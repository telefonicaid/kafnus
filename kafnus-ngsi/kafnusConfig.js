/*
 * Copyright 2025 Telefonica Soluciones de Informatica y Comunicaciones de España, S.A.U.
 * PROJECT: Kafnus
 *
 * This software and / or computer program has been developed by Telefonica Soluciones
 * de Informatica y Comunicaciones de España, S.A.U (hereinafter TSOL) and is protected
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

'use strict';

const _ = require('lodash');
const Ajv = require('ajv');
const logger = require('./lib/utils/logger');

// Require and configure dotenv, will load vars in .env in PROCESS.ENV
require('dotenv').config();

// Define validation for all the env vars
const ajv = new Ajv({ useDefaults: true, coerceTypes: true });

const envVarsSchema = {
    type: 'object',
    properties: {
        NODE_ENV: {
            type: 'string',
            default: 'development',
            enum: ['development', 'production']
        },
        KAFNUS_NGSI_KAFKA_BROKER: {
            type: 'string',
            default: 'kafka:9092'
        },
        KAFNUS_NGSI_GROUP_ID: {
            type: 'string',
            default: 'ngsi-processor'
        },
        KAFNUS_NGSI_LOG_LEVEL: {
            type: 'string',
            default: 'INFO',
            enum: ['INFO', 'WARN', 'ERROR', 'DEBUG']
        },
        KAFNUS_NGSI_LOG_OB: {
            type: 'string',
            default: 'ES'
        },
        KAFNUS_NGSI_LOG_COMP: {
            type: 'string',
            default: 'Kafnus-ngsi'
        },
        KAFNUS_NGSI_ADMIN_PORT: {
            type: 'number',
            default: 8000
        },
        KAFNUS_NGSI_SECURITY_PROTOCOL: {
            type: 'string',
            default: 'plaintext'
        },
        KAFNUS_NGSI_SASL_MECHANISMS: {
            type: 'string',
            default: 'PLAIN'
        },
        KAFNUS_NGSI_SASL_USERNAME: {
            type: 'string',
            default: null
        },
        KAFNUS_NGSI_SASL_PASSWORD: {
            type: 'string',
            default: null
        },
        KAFNUS_NGSI_AUTO_OFFSET_RESET: {
            type: 'string',
            default: 'earliest'
        },
        KAFNUS_NGSI_GRAPHQL_GRAFO: {
            type: 'string',
            default: 'grafo_v_120'
        },
        KAFNUS_NGSI_GRAPHQL_SLUG_URI: {
            type: 'boolean',
            default: false
        }
    }
};

const envVars = _.clone(process.env);
const valid = ajv.addSchema(envVarsSchema, 'envVarsSchema').validate('envVarsSchema', envVars);

if (!valid) {
    logger.getBasicLogger().error(new Error(ajv.errorsText()));
}

const config = {
    env: envVars.NODE_ENV,
    kafka: {
        'bootstrap.servers': envVars.KAFNUS_NGSI_KAFKA_BROKER,
        'security.protocol': envVars.KAFNUS_NGSI_SECURITY_PROTOCOL,
        'sasl.mechanisms': envVars.KAFNUS_NGSI_SASL_MECHANISMS,
        'sasl.username': envVars.KAFNUS_NGSI_SASL_USERNAME,
        'sasl.password': envVars.KAFNUS_NGSI_SASL_PASSWORD,
        'group.id': envVars.KAFNUS_NGSI_GROUP_ID,
        'auto.offset.reset': envVars.KAFNUS_NGSI_AUTO_OFFSET_RESET
    },
    logger: {
        level: envVars.KAFNUS_NGSI_LOG_LEVEL,
        ob: envVars.KAFNUS_NGSI_LOG_OB,
        comp: envVars.KAFNUS_NGSI_LOG_COMP
    },
    admin: {
        port: envVars.KAFNUS_NGSI_ADMIN_PORT
    },
    graphql: {
        grafo: envVars.KAFNUS_NGSI_GRAPHQL_GRAFO,
        slugUri: envVars.KAFNUS_NGSI_GRAPHQL_SLUG_URI
    }
};

module.exports.config = config;
