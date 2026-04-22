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

const { config } = require('../../kafnusConfig');

const GRAFO_PREFIX = config.graphql.grafo;
const GRAFO_SUFFIX = config.graphql.grafoSuffix;

const CORE = 'https://ontologia.segittur.es/turismo/def/core#';

function getGrafoName(service) {
    const grafo = config.graphql.grafoByService
        ? `${GRAFO_PREFIX}${service}${GRAFO_SUFFIX}`
        : `${GRAFO_PREFIX}${GRAFO_SUFFIX}`;
    return grafo;
}

/**
 * Generates a subject URI from entity
 */
function buildSubjectUri(entityId) {
    return `urn:segittur:${encodeURIComponent(entityId)}`;
}

/**
 * Map an attribute name to a RDF predicate
 */
function buildTypeUri(type) {
    return `${CORE}${type}`;
}

function buildPredicateUri(attrName) {
    return `${CORE}${attrName}`;
}

function toLiteral(value) {
    if (typeof value === 'boolean') {
        return `"${value}"^^<http://www.w3.org/2001/XMLSchema#boolean>`;
    }

    if (typeof value === 'number') {
        return Number.isInteger(value)
            ? `"${value}"^^<http://www.w3.org/2001/XMLSchema#integer>`
            : `"${value}"^^<http://www.w3.org/2001/XMLSchema#decimal>`;
    }

    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Converts and NGSI entity in RDF triples
 */
function entityToTriples(entityObject) {
    const triples = [];
    const entityId = entityObject.externalId || entityObject.id;
    const subject = buildSubjectUri(entityId);

    if (entityObject.type) {
        triples.push(
            `<${subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${buildTypeUri(entityObject.type)}> .`
        );
    }

    for (const [attrName, attrValue] of Object.entries(entityObject)) {
        if (attrName === 'id' || attrName === 'externalId' || attrName === 'type' || attrName === 'alterationType') {
            continue;
        }

        const predicate = buildPredicateUri(attrName);
        const values = Array.isArray(attrValue) ? attrValue : [attrValue];

        for (const value of values) {
            triples.push(`<${subject}> <${predicate}> ${toLiteral(value)} .`);
        }
    }

    return triples;
}

/**
 * Builds SPARQL for insert/update/change
 * Simple strategy:
 * - entitydelete => DELETE WHERE of subject
 * - entityupdate/entitychange => DELETE WHERE + INSERT DATA
 * - else => INSERT DATA
 */
function buildSparqlForEntity(graphUri, service, entityObject) {
    const alterationType = String(entityObject.alterationType || '').toLowerCase();

    const entityId = entityObject.externalId || entityObject.id;
    const subject = buildSubjectUri(entityId);
    const triples = entityToTriples(entityObject);

    if (alterationType === 'entitydelete') {
        return `
DELETE WHERE {
  GRAPH <${graphUri}> {
    <${subject}> ?p ?o .
  }
}
        `.trim();
    }

    if (alterationType === 'entityupdate' || alterationType === 'entitychange') {
        return `
DELETE WHERE {
  GRAPH <${graphUri}> {
    <${subject}> ?p ?o .
  }
};

INSERT DATA {
  GRAPH <${graphUri}> {
    ${triples.join('\n    ')}
  }
}
        `.trim();
    }

    return `
INSERT DATA {
  GRAPH <${graphUri}> {
    ${triples.join('\n    ')}
  }
}
    `.trim();
}

exports.getGrafoName = getGrafoName;
exports.buildSparqlForEntity = buildSparqlForEntity;
