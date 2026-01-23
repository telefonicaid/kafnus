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

-- test.lighting_streetlight definition

-- Drop table
DROP TABLE IF EXISTS test.lighting_streetlight;
-- Create Table
CREATE TABLE test.lighting_streetlight (
    timeinstant            timestamptz NOT NULL,
    recvtime               timestamptz NOT NULL,
    entityid               text NOT NULL,
    entitytype             text NULL,
    fiwareservicepath      text NULL,
    location               geometry(Point, 4326) NULL,
    address                text NULL,
    illuminancelevel       float8 NULL,
    enablehistoriccommand  boolean NULL,
    variables              jsonb NULL,
    fixtureconfiguration   json NULL,
    maintaineremail        text NULL,
    lumensadjustment       float8 NULL,
    fixturemodelid         bigint NULL,
    ledcount               bigint NULL,
    wattageconsumption     float NULL,
    colortempkelvin        float8 NULL,
    beamangle              float8 NULL,
    luminousefficacy       float NULL,
    installationid         bigint NULL,
    compatiblefixtures     json NULL,
    dimminglevels          json NULL,
    temperaturerangek      json NULL,
	CONSTRAINT lighting_streetlight_pkey PRIMARY KEY (timeinstant, entityid)
);
CREATE INDEX lighting_streetlight_idx_ld ON test.lighting_streetlight USING btree (entityid, timeinstant DESC);
CREATE INDEX lighting_streetlight_timeinstant_idx ON test.lighting_streetlight USING btree (timeinstant DESC);

-- Table Triggers
-- create trigger ts_insert_blocker before
-- insert
--     on
--     test.lighting_streetlight for each row execute function _timescaledb_internal.insert_blocker();


-- test.lighting_streetlight_lastdata definition

-- Drop table
DROP TABLE IF EXISTS test.lighting_streetlight_lastdata;
-- Create Table
CREATE TABLE test.lighting_streetlight_lastdata (
    timeinstant            timestamptz NOT NULL,
    recvtime               timestamptz NOT NULL,
    entityid               text NOT NULL,
    entitytype             text NULL,
    fiwareservicepath      text NULL,
    location               geometry(Point, 4326) NULL,
    address                text NULL,
    illuminancelevel       float8 NULL,
    enablehistoriccommand  boolean NULL,
    variables              jsonb NULL,
    fixtureconfiguration   json NULL,
    maintaineremail        text NULL,
    lumensadjustment       float8 NULL,
    fixturemodelid         bigint NULL,
    ledcount               bigint NULL,
    wattageconsumption     float NULL,
    colortempkelvin        float8 NULL,
    beamangle              float8 NULL,
    luminousefficacy       float NULL,
    installationid         bigint NULL,
    compatiblefixtures     json NULL,
    dimminglevels          json NULL,
    temperaturerangek      json NULL,
	CONSTRAINT lighting_streetlight_lastdata_pkey PRIMARY KEY (entityid)
);

-- test.lighting_streetlight_lastdata definition

-- Drop table
DROP TABLE IF EXISTS test.lighting_streetlight_mutable;
-- Create Table
CREATE TABLE test.lighting_streetlight_mutable (
    timeinstant            timestamptz NOT NULL,
    recvtime               timestamptz NOT NULL,
    entityid               text NOT NULL,
    entitytype             text NULL,
    fiwareservicepath      text NULL,
    location               geometry(Point, 4326) NULL,
    address                text NULL,
    illuminancelevel       float8 NULL,
    enablehistoriccommand  boolean NULL,
    variables              jsonb NULL,
    fixtureconfiguration   json NULL,
    maintaineremail        text NULL,
    lumensadjustment       float8 NULL,
    fixturemodelid         bigint NULL,
    ledcount               bigint NULL,
    wattageconsumption     float NULL,
    colortempkelvin        float8 NULL,
    beamangle              float8 NULL,
    luminousefficacy       float NULL,
    installationid         bigint NULL,
    compatiblefixtures     json NULL,
    dimminglevels          json NULL,
    temperaturerangek      json NULL,
	CONSTRAINT lighting_streetlight_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);