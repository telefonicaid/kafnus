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

const mockCreateConsumerAgent = jest.fn();
const mockGetFiwareContext = jest.fn();
const mockTransformSgtrGeoJsonToWkt = jest.fn();
const mockSafeProduce = jest.fn();
const mockBuildMutationCreate = jest.fn();
const mockBuildMutationUpdate = jest.fn();

jest.mock('../lib/consumerAgents/sharedConsumerAgentFactory', () => ({
    createConsumerAgent: (...args) => mockCreateConsumerAgent(...args)
}));

jest.mock('../lib/utils/ngsiUtils', () => ({
    getFiwareContext: (...args) => mockGetFiwareContext(...args),
    transformSgtrGeoJsonToWkt: (...args) => mockTransformSgtrGeoJsonToWkt(...args)
}));

jest.mock('../lib/utils/handleEntityCb', () => ({
    safeProduce: (...args) => mockSafeProduce(...args)
}));

jest.mock('../lib/utils/admin', () => ({
    recordFlowProcessing: jest.fn()
}));

jest.mock('../lib/utils/graphqlUtils', () => ({
    slugify: (value) => value,
    buildMutationCreate: (...args) => mockBuildMutationCreate(...args),
    buildMutationUpdate: (...args) => mockBuildMutationUpdate(...args),
    buildMutationDelete: jest.fn()
}));

jest.mock('../kafnusConfig', () => ({
    config: {
        ngsi: {
            prefix: 'smc_',
            suffix: ''
        },
        graphql: {
            slugUri: false,
            outputTopicByService: false
        }
    }
}));

jest.mock('@confluentinc/kafka-javascript', () => ({
    CODES: {
        ERRORS: {
            ERR__QUEUE_FULL: 'ERR__QUEUE_FULL'
        }
    }
}));

const startSgtrConsumerAgent = require('../lib/consumerAgents/sgtrConsumerAgent');

describe('sgtrConsumerAgent.js', () => {
    let logger;
    let onData;
    let commitMessage;

    beforeEach(() => {
        jest.clearAllMocks();

        logger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        commitMessage = jest.fn();

        mockCreateConsumerAgent.mockImplementation((_logger, options) => {
            onData = options.onData;
            return Promise.resolve({ commitMessage });
        });

        mockGetFiwareContext.mockReturnValue({ service: 'es' });

        mockTransformSgtrGeoJsonToWkt.mockImplementation((entityObject) => {
            entityObject.asWkt = 'POINT (34.5555 -3.67778)';
            delete entityObject.asGeoJSON;
        });

        mockBuildMutationCreate.mockReturnValue({ query: 'mutation { createLocation { uri } }' });
        mockBuildMutationUpdate.mockReturnValue({ query: 'mutation { updateLocation { uri } }' });
        mockSafeProduce.mockResolvedValue();
    });

    test('transforms SGTR asGeoJSON into asWkt before create mutation', async () => {
        await startSgtrConsumerAgent(logger, {});

        const msg = {
            key: Buffer.from('key-1'),
            value: Buffer.from(
                JSON.stringify({
                    data: [
                        {
                            alterationType: 'entityCreate',
                            type: 'Location',
                            externalId: 'Location:001',
                            asGeoJSON: {
                                type: 'Point',
                                coordinates: [34.5555, -3.67778]
                            }
                        }
                    ]
                })
            ),
            headers: []
        };

        await onData(msg);

        expect(mockTransformSgtrGeoJsonToWkt).toHaveBeenCalledTimes(1);
        expect(mockBuildMutationCreate).toHaveBeenCalledWith(
            'es',
            'Location',
            expect.objectContaining({
                externalId: 'Location:001',
                asWkt: 'POINT (34.5555 -3.67778)'
            })
        );
        expect(mockBuildMutationCreate.mock.calls[0][2]).not.toHaveProperty('asGeoJSON');
        expect(commitMessage).toHaveBeenCalledWith(msg);
    });

    test('does not transform geometry for non-Location entities', async () => {
        await startSgtrConsumerAgent(logger, {});

        const msg = {
            key: Buffer.from('key-2'),
            value: Buffer.from(
                JSON.stringify({
                    data: [
                        {
                            alterationType: 'entityCreate',
                            type: 'Device',
                            externalId: 'Device:001',
                            asGeoJSON: {
                                type: 'Point',
                                coordinates: [34.5555, -3.67778]
                            }
                        }
                    ]
                })
            ),
            headers: []
        };

        await onData(msg);

        expect(mockTransformSgtrGeoJsonToWkt).not.toHaveBeenCalled();
        expect(mockBuildMutationCreate).toHaveBeenCalledWith(
            'es',
            'Device',
            expect.objectContaining({
                externalId: 'Device:001',
                asGeoJSON: {
                    type: 'Point',
                    coordinates: [34.5555, -3.67778]
                }
            })
        );
        expect(commitMessage).toHaveBeenCalledWith(msg);
    });

    test('transforms SGTR asGeoJSON into asWkt before update mutation', async () => {
        await startSgtrConsumerAgent(logger, {});

        const msg = {
            key: Buffer.from('key-3'),
            value: Buffer.from(
                JSON.stringify({
                    data: [
                        {
                            alterationType: 'entityUpdate',
                            type: 'Location',
                            externalId: 'Location:002',
                            asGeoJSON: {
                                type: 'Point',
                                coordinates: [34.5555, -3.67778]
                            }
                        }
                    ]
                })
            ),
            headers: []
        };

        await onData(msg);

        expect(mockTransformSgtrGeoJsonToWkt).toHaveBeenCalledTimes(1);
        expect(mockBuildMutationUpdate).toHaveBeenCalledWith(
            'es',
            'Location',
            'Location:002',
            expect.objectContaining({ asWkt: 'POINT (34.5555 -3.67778)' })
        );
        expect(mockBuildMutationUpdate.mock.calls[0][3]).not.toHaveProperty('asGeoJSON');
        expect(mockBuildMutationUpdate.mock.calls[0][3]).not.toHaveProperty('asWKT');
        expect(commitMessage).toHaveBeenCalledWith(msg);
    });

    test('commits message and logs warning when JSON is invalid', async () => {
        await startSgtrConsumerAgent(logger, {});

        const msg = {
            key: Buffer.from('key-4'),
            value: Buffer.from('not-valid-json'),
            headers: []
        };

        await onData(msg);

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON'), expect.any(String));
        expect(commitMessage).toHaveBeenCalledWith(msg);
        expect(mockBuildMutationCreate).not.toHaveBeenCalled();
    });
});
