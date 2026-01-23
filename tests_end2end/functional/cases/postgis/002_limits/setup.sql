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
-- Drop table
DROP TABLE IF EXISTS test.limit_sensor;

-- Create table
CREATE TABLE IF NOT EXISTS test.limit_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,

    -- Limit numerical values
    value_smallint SMALLINT,               -- 16 bits
    value_integer INTEGER,                 -- 32 bits
    value_bigint BIGINT,                   -- 64 bits
    value_real REAL,                        -- ~7 decimal digits
    value_double DOUBLE PRECISION,         -- ~15 decimal digits
    value_numeric NUMERIC(30,15),          -- 30 digits total, 15 after decimal

    -- Geometry
    geom_point GEOMETRY(Point, 4326),
    geom_polygon GEOMETRY(Polygon, 4326),
    
    CONSTRAINT limit_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.limit_sensor_lastdata;

-- Create table
CREATE TABLE IF NOT EXISTS test.limit_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,

    -- Limit numerical values
    value_smallint SMALLINT,               -- 16 bits
    value_integer INTEGER,                 -- 32 bits
    value_bigint BIGINT,                   -- 64 bits
    value_real REAL,                        -- ~7 decimal digits
    value_double DOUBLE PRECISION,         -- ~15 decimal digits
    value_numeric NUMERIC(30,15),          -- 30 digits total, 15 after decimal

    -- Geometry
    geom_point GEOMETRY(Point, 4326),
    geom_polygon GEOMETRY(Polygon, 4326),
    
    CONSTRAINT limit_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.limit_sensor_mutable;

-- Create table
CREATE TABLE IF NOT EXISTS test.limit_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,

    -- Limit numerical values
    value_smallint SMALLINT,               -- 16 bits
    value_integer INTEGER,                 -- 32 bits
    value_bigint BIGINT,                   -- 64 bits
    value_real REAL,                        -- ~7 decimal digits
    value_double DOUBLE PRECISION,         -- ~15 decimal digits
    value_numeric NUMERIC(30,15),          -- 30 digits total, 15 after decimal

    -- Geometry
    geom_point GEOMETRY(Point, 4326),
    geom_polygon GEOMETRY(Polygon, 4326),
    
    CONSTRAINT limit_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);