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

describe('graphqlUtils.js', () => {
    function loadModule(graphqlConfig = {}) {
        jest.resetModules();

        jest.doMock('../kafnusConfig', () => ({
            config: {
                graphql: {
                    grafo: 'grafo_',
                    grafoSuffix: '_suffix',
                    grafoByService: true,
                    staging: false,
                    slugUri: false,
                    ...graphqlConfig
                }
            }
        }));

        return require('../lib/utils/graphqlUtils');
    }

    describe('slugify', () => {
        test('normalizes Unicode, removes diacritics and replaces separators with hyphens', () => {
            const { slugify } = loadModule();

            expect(slugify('Descripcion numero 001')).toBe('descripcion-numero-001');
        });

        test('removes leading and trailing hyphens', () => {
            const { slugify } = loadModule();

            expect(slugify('---Hola mundo---')).toBe('hola-mundo');
        });

        test('returns empty string when only non-alphanumeric symbols are present', () => {
            const { slugify } = loadModule();

            expect(slugify('@@@###')).toBe('');
        });
    });

    describe('buildMutation', () => {
        test('builds a generic mutation with capitalized entityType and selection set', () => {
            const { buildMutation } = loadModule();

            const result = buildMutation(
                'create',
                'room',
                {
                    id: 'Room:001',
                    active: true,
                    count: 2
                },
                ['uri', 'name']
            );

            expect(result).toEqual({
                query: expect.stringContaining('createRoom(id: "Room:001", active: true, count: 2) { uri name }')
            });
        });

        test('omits selection set when returnFields is empty', () => {
            const { buildMutation } = loadModule();

            const result = buildMutation(
                'delete',
                'data',
                {
                    uris: ['a', 'b']
                },
                []
            );

            expect(result.query).toContain('deleteData(uris: ["a", "b"])');
            expect(result.query).not.toContain('{ uri }');
        });

        test('properly escapes strings with quotes, backslashes and new lines', () => {
            const { buildMutation } = loadModule();

            const result = buildMutation(
                'create',
                'note',
                {
                    text: 'l�nea "1"\\nreal\nsegunda'
                },
                ['uri']
            );

            expect(result.query).toContain('text: "l�nea \\"1\\"\\\\nreal\\nsegunda"');
        });

        test('serializes arrays and nested objects correctly', () => {
            const { buildMutation } = loadModule();

            const result = buildMutation(
                'create',
                'sensor',
                {
                    tags: ['a', 'b'],
                    meta: {
                        enabled: true,
                        retries: 3
                    }
                },
                ['uri']
            );

            expect(result.query).toContain('tags: ["a", "b"]');
            expect(result.query).toContain('meta: { enabled: true, retries: 3 }');
        });

        test('capitalizes entityType and returns empty string if entityType is falsy', () => {
            const { buildMutation } = loadModule();

            const result = buildMutation('create', '', { foo: 'bar' }, ['uri']);

            expect(result.query).toContain('create(foo: "bar") { uri }');
        });
    });

    describe('buildMutationCreate', () => {
        test('builds create mutation with service-based graph and no staging when staging=false', () => {
            const { buildMutationCreate } = loadModule({
                grafo: 'kg_',
                grafoSuffix: '_prd',
                grafoByService: true,
                staging: false
            });

            const result = buildMutationCreate('myservice', 'room', {
                uri: 'http://example.org/resource/Room:001',
                name: 'Room 001'
            });

            expect(result.query).toContain('createRoom(');
            expect(result.query).toContain('dti: "kg_myservice_prd"');
            expect(result.query).toContain(
                'input: { object: { uri: "http://example.org/resource/Room:001", name: "Room 001" } }'
            );
            expect(result.query).not.toContain('staging:');
            expect(result.query).toContain('{ uri }');
        });

        test('includes staging when config.graphql.staging=true', () => {
            const { buildMutationCreate } = loadModule({
                staging: true
            });

            const result = buildMutationCreate('svc', 'room', {
                uri: 'http://example.org/resource/Room:001'
            });

            expect(result.query).toContain('staging: true');
        });

        test('slugifies the end of value.uri when slugUri=true', () => {
            const { buildMutationCreate } = loadModule({
                slugUri: true
            });

            const result = buildMutationCreate('svc', 'description', {
                uri: 'http://example.org/resource/Description:001'
            });

            expect(result.query).toContain('uri: "http://example.org/resource/description-001"');
        });

        test('uses global graph when grafoByService=false', () => {
            const { buildMutationCreate } = loadModule({
                grafo: 'grafo_',
                grafoSuffix: '_suffix',
                grafoByService: false
            });

            const result = buildMutationCreate('ignoredservice', 'room', {
                uri: 'http://example.org/resource/Room:001'
            });

            expect(result.query).toContain('dti: "grafo__suffix"');
        });
    });

    describe('buildMutationUpdate', () => {
        test('builds update mutation with dti, input and uri in selection set', () => {
            const { buildMutationUpdate } = loadModule({
                grafoByService: true,
                staging: false
            });

            const result = buildMutationUpdate('myservice', 'room', 'Room:001', {
                uri: 'http://example.org/resource/Room:001',
                temperature: 23.4
            });

            expect(result.query).toContain('updateRoom(');
            expect(result.query).toContain('dti: "grafo_myservice_suffix"');
            expect(result.query).toContain(
                'input: { object: { uri: "http://example.org/resource/Room:001", temperature: 23.4 } }'
            );
            expect(result.query).toContain('{ uri }');
        });

        test('includes staging in update when config.graphql.staging=true', () => {
            const { buildMutationUpdate } = loadModule({
                staging: true
            });

            const result = buildMutationUpdate('svc', 'room', 'Room:001', {
                uri: 'http://example.org/resource/Room:001'
            });

            expect(result.query).toContain('staging: true');
        });
    });

    describe('buildMutationDelete', () => {
        test('builds delete mutation using URI constructed with service-based graph', () => {
            const { buildMutationDelete } = loadModule({
                grafo: 'kg_',
                grafoSuffix: '_prd',
                grafoByService: true,
                staging: false
            });

            const result = buildMutationDelete('myservice', 'Room:001');

            expect(result.query).toContain('deleteData(');
            expect(result.query).toContain('dti: "kg_myservice_prd"');
            expect(result.query).toContain('uris: ["http://datos.segittur.es/kg_myservice_prd/resource/Room:001"]');
            expect(result.query).not.toContain('{ uri }');
            expect(result.query).not.toContain('staging:');
        });

        test('includes staging in delete when config.graphql.staging=true', () => {
            const { buildMutationDelete } = loadModule({
                staging: true
            });

            const result = buildMutationDelete('svc', 'Room:001');

            expect(result.query).toContain('staging: true');
        });

        test('uses global graph when grafoByService=false', () => {
            const { buildMutationDelete } = loadModule({
                grafo: 'grafo_',
                grafoSuffix: '_suffix',
                grafoByService: false
            });

            const result = buildMutationDelete('ignored', 'Room:001');

            expect(result.query).toContain('dti: "grafo__suffix"');
            expect(result.query).toContain('uris: ["http://datos.segittur.es/grafo__suffix/resource/Room:001"]');
        });
    });
});
