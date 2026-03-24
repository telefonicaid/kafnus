/*
* Copyright 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
*
* This file is part of kafnus-connect
*
* kafnus-connect is free software: you can redistribute it and/or
* modify it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* kafnus-connect is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
* General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with kafnus. If not, see http://www.gnu.org/licenses/.
*/

CREATE SCHEMA IF NOT EXISTS simple;
CREATE SCHEMA IF NOT EXISTS testdatamodel;

DROP TABLE IF EXISTS simple.simple_sensor_lastdata;
CREATE TABLE IF NOT EXISTS simple.simple_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT simple_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

DROP TABLE IF EXISTS testdatamodel.simple_sensor_lastdata;
CREATE TABLE IF NOT EXISTS testdatamodel.simple_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT testdatamodel_simple_sensor_lastdata_pkey PRIMARY KEY (entityid)
);