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

const theLogger = require('./logger');
const logger = theLogger.getBasicLogger();

const GRAFO = 'grafo_v_120';
const PREFIX_RESOURCE = `http://datos.segittur.es/${GRAFO}/resource/`;
const PREFIX_KOS = 'https://ontologia.segittur.es/turismo/kos/';
const GRAFO_STR = `"${GRAFO}"`;

function toGraphQLValue(value) {
    if (typeof value === 'string') {
        return `"${
            value
                .replace(/\\/g, '\\\\') // backslashes
                .replace(/"/g, '\\"') // double quotes
                .replace(/\n/g, '\\n') // new lines
        }"`;
    } else if (Array.isArray(value)) {
        return `[${value.map(toGraphQLValue).join(', ')}]`;
    } else if (value && typeof value === 'object') {
        return `{ ${Object.entries(value)
            .map(([k, v]) => `${k}: ${toGraphQLValue(v)}`)
            .join(', ')} }`;
    } else {
        return String(value); // number, booleans, null
    }
}

function addPrefix(prefix, root) {
    return prefix + root;
}

function buildMutationCreate(entityType, entityObject) {
    // Convert object to string for GraphQL
    const objectString = toGraphQLValue(entityObject);

    const templateMutationCreate = {
        query: `
            mutation {
                create${entityType}(dti: ${GRAFO_STR},
                    input: {
                        object: ${objectString}
                    }
                ) { 
                    uri 
                }
            }
        `
    };

    return templateMutationCreate;
}

function buildMutationUpdate(entityType, id, entityObject) {
    const objectString = toGraphQLValue(entityObject);
    // const uri = addPrefix(PREFIX_RESOURCE, id);
    // const uriString = toGraphQLValue(uri);
    // const idString = toGraphQLValue(id);

    return {
        query: `
            mutation {
                update${entityType}(dti: ${GRAFO_STR},
                    input: {
                        object: ${objectString}
                    }
                ) {
                    uri
                }
            }
        `
    };
}

function buildMutationDelete(/*entityType,*/ id) {
    const uri = addPrefix(PREFIX_RESOURCE, id);
    // return {
    //     query: `
    //         mutation {
    //             delete${entityType}(dti: ${GRAFO_STR}, id: "${id}")
    //         }
    //     `
    // };
    return {
        query: `
            mutation {
                deleteData(dti: ${GRAFO_STR}, uris: ["${uri}"])
            }
        `
    };
}

function buildMutation(type, entityName, args = {}, returnFields = ['uri']) {
    const argsString = Object.entries(args)
        .map(([k, v]) => `${k}: ${toGraphQLValue(v)}`)
        .join(', ');

    const returnFieldsString = returnFields.join(' ');

    return {
        query: `
            mutation {
                ${type}${entityName}(${argsString}) {
                    ${returnFieldsString}
                }
            }
        `
    };
}

exports.buildMutationCreate = buildMutationCreate;
exports.buildMutationUpdate = buildMutationUpdate;
exports.buildMutationDelete = buildMutationDelete;
exports.buildMutation = buildMutation;
