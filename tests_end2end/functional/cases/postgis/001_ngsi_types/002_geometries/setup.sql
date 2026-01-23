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
DROP TABLE IF EXISTS test.parking_zone;

-- Create table
CREATE TABLE test.parking_zone (
	timeinstant timestamptz NOT NULL,
	"location" public.geometry(point) NULL,
	polygon public.geometry(polygon) NULL,
	linestring public.geometry(linestring) NULL,
	multipoint public.geometry(multipoint) NULL,
	multilinestring public.geometry(multilinestring) NULL,
	multipolygon public.geometry(multipolygon) NULL,
	zoneignored public.geometry(polygon) NULL,
	feature public.geometry(point) NULL,
	featurecollection public.geometry(polygon) NULL,
	"name" text NULL,
	zip text NULL,
	"zone" text NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NOT NULL,
	fiwareservicepath text NULL
);
CREATE INDEX parking_zone_idx_gidx ON test.parking_zone USING gist (location);
CREATE INDEX parking_zone_idx_linestring ON test.parking_zone USING gist (linestring);
CREATE INDEX parking_zone_idx_multipoint ON test.parking_zone USING gist (multipoint);
CREATE INDEX parking_zone_idx_multilinestring ON test.parking_zone USING gist (multilinestring);
CREATE INDEX parking_zone_idx_multipolygon ON test.parking_zone USING gist (multipolygon);
CREATE INDEX parking_zone_idx_zip ON test.parking_zone USING btree (zip, timeinstant);
CREATE INDEX parking_zone_idx_zon ON test.parking_zone USING btree (zone, timeinstant);
CREATE INDEX parking_zone_timeinstant_idx ON test.parking_zone USING btree (timeinstant DESC);

-- Drop table
DROP TABLE IF EXISTS test.parking_zone_lastdata;

-- Create table
CREATE TABLE test.parking_zone_lastdata (
	timeinstant timestamptz NULL,
	"location" public.geometry(point) NULL,
	polygon public.geometry(polygon) NULL,
	linestring public.geometry(linestring) NULL,
	multipoint public.geometry(multipoint) NULL,
	multilinestring public.geometry(multilinestring) NULL,
	multipolygon public.geometry(multipolygon) NULL,
	zoneignored public.geometry(polygon) NULL,
	feature public.geometry(point) NULL,
	featurecollection public.geometry(polygon) NULL,
	"name" text NULL,
	zip text NULL,
	"zone" text NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NULL,
	fiwareservicepath text NULL,
	CONSTRAINT parking_zone_lastdata_pkey PRIMARY KEY (entityid)
);
CREATE INDEX parking_zone_lastdata_idx_gidx ON test.parking_zone_lastdata USING gist (location);
CREATE INDEX parking_zone_lastdata_idx_linestring ON test.parking_zone_lastdata USING gist (linestring);
CREATE INDEX parking_zone_lastdata_idx_multipoint ON test.parking_zone_lastdata USING gist (multipoint);
CREATE INDEX parking_zone_lastdata_idx_multilinestring ON test.parking_zone_lastdata USING gist (multilinestring);
CREATE INDEX parking_zone_lastdata_idx_multipolygon ON test.parking_zone_lastdata USING gist (multipolygon);
CREATE INDEX parking_zone_lastdata_idx_zip ON test.parking_zone_lastdata USING btree (zip);
CREATE INDEX parking_zone_lastdata_idx_zon ON test.parking_zone_lastdata USING btree (zone);