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

const theLogger = require('./logger');
const logger = theLogger.getBasicLogger();
const { config } = require('../../kafnusConfig');

const GRAFO_PREFIX = config.graphql['grafo'];
const PREFIX_RESOURCE = `http://datos.segittur.es/${GRAFO_PREFIX}/resource/`;
const PREFIX_KOS = 'https://ontologia.segittur.es/turismo/kos/';
const GRAFO_PREFIX_STR = `"${GRAFO_PREFIX}"`;

function slugify(text) {
    // Normalize Unicode using NFKD (e.g., "é" → "é")
    text = text
        .normalize('NFKD')
        // Remove diacritic marks
        .replace(/[\u0300-\u036f]/g, '');

    // Convert to lowercase
    text = text.toLowerCase();

    // Replace any non-alphanumeric characters with hyphens
    text = text.replace(/[^a-z0-9]+/g, '-');

    // Remove leading and trailing hyphens
    text = text.replace(/^-+|-+$/g, '');

    return text;
}

function slugifyUri(uri) {
    const parts = uri.split('/');
    const last = parts.pop(); // i.e. "Description:001"
    const slugified = slugify(last); // i.e. "description-001"
    return [...parts, slugified].join('/');
}

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
        if (
            config.graphql.slugUri &&
            // Check URIs and slugify the end of uri
            'uri' in value &&
            typeof value.uri === 'string'
        ) {
            const newUri = slugifyUri(value.uri);
            return `{ uri: "${newUri}" }`;
        }

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

function capitalEntityType(entityType) {
    if (!entityType) return '';
    return entityType.charAt(0).toUpperCase() + entityType.slice(1).toLowerCase();
}

function getGrafo(service) {
    if (config.graphql.grafoByService) {
        return GRAFO_PREFIX_STR + '_' + service;
    } else {
        return GRAFO_PREFIX_STR;
    }
}

function buildMutationCreate(service, entityType, entityObject) {
    // Convert object to string for GraphQL
    const objectString = toGraphQLValue(entityObject);
    const capEntityType = capitalEntityType(entityType);
    const GRAFO_STR = getGrafo(service);

    const templateMutationCreate = {
        query: `
            mutation {
                create${capEntityType}(dti: ${GRAFO_STR},
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

function buildMutationUpdate(service, entityType, id, entityObject) {
    const objectString = toGraphQLValue(entityObject);
    const capEntityType = capitalEntityType(entityType);
    const GRAFO_STR = getGrafo(service);
    // const uri = addPrefix(PREFIX_RESOURCE, id);
    // const uriString = toGraphQLValue(uri);
    // const idString = toGraphQLValue(id);

    return {
        query: `
            mutation {
                update${capEntityType}(dti: ${GRAFO_STR},
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

function buildMutationDelete(service, /*entityType,*/ id) {
    const uri = addPrefix(PREFIX_RESOURCE, id);
    const GRAFO_STR = getGrafo(service);
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

function buildMutation(type, entityType, args = {}, returnFields = ['uri']) {
    const argsString = Object.entries(args)
        .map(([k, v]) => `${k}: ${toGraphQLValue(v)}`)
        .join(', ');

    const returnFieldsString = returnFields.join(' ');
    const capEntityType = capitalEntityType(entityType);

    return {
        query: `
            mutation {
                ${type}${capEntityType}(${argsString}) {
                    ${returnFieldsString}
                }
            }
        `
    };
}

exports.slugify = slugify;
exports.buildMutationCreate = buildMutationCreate;
exports.buildMutationUpdate = buildMutationUpdate;
exports.buildMutationDelete = buildMutationDelete;
exports.buildMutation = buildMutation;
