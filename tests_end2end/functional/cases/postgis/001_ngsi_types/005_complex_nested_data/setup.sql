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
*  - Fermín Galán
*  - Oriana Romero
*/
-- Drop and create complex data sensor tables
DROP TABLE IF EXISTS test.complexdata_device;
DROP TABLE IF EXISTS test.complexdata_device_lastdata;  
DROP TABLE IF EXISTS test.complexdata_device_mutable;

CREATE TABLE IF NOT EXISTS test.complexdata_device (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    configuration JSONB,
    measurements JSONB,
    metadata JSONB,
    tags JSONB,-- TEXT[], is not supported at the moment
    CONSTRAINT complexdata_device_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.complexdata_device_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    configuration JSONB,
    measurements JSONB,
    metadata JSONB,
    tags JSONB,-- TEXT[], is not supported at the moment
    CONSTRAINT complexdata_device_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.complexdata_device_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    configuration JSONB,
    measurements JSONB,
    metadata JSONB,
    tags JSONB,-- TEXT[], is not supported at the moment
    CONSTRAINT complexdata_device_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);