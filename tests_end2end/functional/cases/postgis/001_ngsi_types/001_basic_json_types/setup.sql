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
DROP TABLE IF EXISTS test.types_zone;

-- Create table
CREATE TABLE IF NOT EXISTS test.types_zone (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,

    -- Basic JSON types mapped to PG types
    str_col TEXT,
    number_col DOUBLE PRECISION,
    bool_col BOOLEAN,
    null_col TEXT,
    obj_col JSONB,
    array_col JSONB,

    CONSTRAINT types_zone_pkey PRIMARY KEY (timeinstant, entityid)
);