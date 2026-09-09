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

-- Historic: no TimeInstant provided at all; timeinstant must still be filled in (recvtime fallback, when KAFNUS_NGSI_ENSURE_TIMEINSTANT is enabled)
DROP TABLE IF EXISTS test.no_ti_sensor;
CREATE TABLE IF NOT EXISTS test.no_ti_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT no_ti_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Mutable: same primary key shape, same guarantee applies
DROP TABLE IF EXISTS test.no_ti_sensor_mutable;
CREATE TABLE IF NOT EXISTS test.no_ti_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT no_ti_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);
