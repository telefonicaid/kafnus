/*
* Copyright 2026 Telefonica Soluciones de Informatica y Comunicaciones de Espana, S.A.U.
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

-- Historic: one row per distinct per-attribute TimeInstant
DROP TABLE IF EXISTS test.split_sensor;
CREATE TABLE IF NOT EXISTS test.split_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT split_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Lastdata: single latest row (must NOT be split)
DROP TABLE IF EXISTS test.split_sensor_lastdata;
CREATE TABLE IF NOT EXISTS test.split_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT split_sensor_lastdata_pkey PRIMARY KEY (entityid)
);
