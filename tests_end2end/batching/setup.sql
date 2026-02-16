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

-- Drop table
DROP TABLE IF EXISTS test.batch_test;

-- Create table
CREATE TABLE IF NOT EXISTS test.batch_test (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT batch_test_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.batch_test_lastdata;

-- Create table
CREATE TABLE IF NOT EXISTS test.batch_test_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT batch_test_lastdata_pkey PRIMARY KEY (entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.batch_test_mutable;

-- Create table
CREATE TABLE IF NOT EXISTS test.batch_test_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT batch_test_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.batch2_test;

-- Create table
CREATE TABLE IF NOT EXISTS test.batch2_test (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT batch2_test_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.batch2_test_lastdata;

-- Create table
CREATE TABLE IF NOT EXISTS test.batch2_test_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT batch2_test_lastdata_pkey PRIMARY KEY (entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.batch2_test_mutable;

-- Create table
CREATE TABLE IF NOT EXISTS test.batch2_test_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT batch2_test_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.sentinel_test;

-- Create table
CREATE TABLE IF NOT EXISTS test.sentinel_test (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT sentinel_test_pkey PRIMARY KEY (timeinstant, entityid)
);

DROP TABLE IF EXISTS test.ngsi_backlog_test;
CREATE TABLE IF NOT EXISTS test.ngsi_backlog_test (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    seq INTEGER,
    CONSTRAINT ngsi_backlog_test_pkey PRIMARY KEY (timeinstant, entityid)
);

DROP TABLE IF EXISTS test.ngsi_sentinel_test;
CREATE TABLE IF NOT EXISTS test.ngsi_sentinel_test (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    seq INTEGER,
    CONSTRAINT ngsi_sentinel_test_pkey PRIMARY KEY (timeinstant, entityid)
);
