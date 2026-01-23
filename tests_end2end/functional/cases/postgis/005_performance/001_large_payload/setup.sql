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
-- Drop and create performance test tables
DROP TABLE IF EXISTS test.performance_sensor;
DROP TABLE IF EXISTS test.performance_sensor_lastdata;
DROP TABLE IF EXISTS test.performance_sensor_mutable;

CREATE TABLE IF NOT EXISTS test.performance_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    light_level INTEGER,
    battery_level INTEGER,
    data_payload JSONB,
    CONSTRAINT performance_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.performance_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    light_level INTEGER,
    battery_level INTEGER,
    data_payload JSONB,
    CONSTRAINT performance_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.performance_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    light_level INTEGER,
    battery_level INTEGER,
    data_payload JSONB,
    CONSTRAINT performance_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);