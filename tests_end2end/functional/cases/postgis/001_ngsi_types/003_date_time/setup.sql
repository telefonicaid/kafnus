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
DROP TABLE IF EXISTS test.date_zone;

-- Create table
CREATE TABLE test.date_zone (
	timeinstant timestamptz NOT NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NOT NULL,
	fiwareservicepath text NULL,
	timeinstant_tz        timestamptz,       -- with time zone
	timeinstant_no_tz     timestamp,         -- without time zone
	timeinstant_wo_tz     timestamp without time zone  -- explicitly without time zone
);

-- Drop table
DROP TABLE IF EXISTS test.date_zone_lastdata;

-- Create table
CREATE TABLE test.date_zone_lastdata (
	timeinstant timestamptz NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NULL,
	fiwareservicepath text NULL,
	timeinstant_tz        timestamptz,       -- with time zone
	timeinstant_no_tz     timestamp,         -- without time zone
	timeinstant_wo_tz     timestamp without time zone,  -- explicitly without time zone
	CONSTRAINT date_zone_lastdata_pkey PRIMARY KEY (entityid)
);