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

-- Schema
CREATE SCHEMA IF NOT EXISTS test;

-- AccessCount Access
DROP TABLE IF EXISTS test.accesscount_access;
CREATE TABLE test.accesscount_access (
	timeinstant timestamptz NOT NULL,
	numberofincoming float8 NULL,
	numberofoutgoing float8 NULL,
	status text NULL,
	averagestay float8 NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NULL,
	fiwareservicepath text NULL,
	CONSTRAINT accesscount_access_pkey PRIMARY KEY (timeinstant, entityid)
);

-- AccessCount Lastdata
DROP TABLE IF EXISTS test.accesscount_access_lastdata;
CREATE TABLE test.accesscount_access_lastdata (
	timeinstant timestamptz NOT NULL,
	numberofincoming float8 NULL,
	numberofoutgoing float8 NULL,
	status text NULL,
	averagestay float8 NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NULL,
	fiwareservicepath text NULL,
	CONSTRAINT accesscount_access_lastdata_pkey PRIMARY KEY (entityid)
);

-- Parking Zone
DROP TABLE IF EXISTS test.parking_zone;
CREATE TABLE test.parking_zone (
	timeinstant timestamptz NOT NULL,
	"location" public.geometry(point) NULL,
	polygon public.geometry(polygon) NULL,
	"name" text NULL,
	zip text NULL,
	"zone" text NULL,
	district text NULL,
	municipality text NULL,
	province text NULL,
	region text NULL,
	community text NULL,
	country text NULL,
	streetaddress text NULL,
	postalcode text NULL,
	addresslocality text NULL,
	addressregion text NULL,
	addresscommunity text NULL,
	addresscountry text NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NOT NULL,
	fiwareservicepath text NULL
);

-- Routes Stop
DROP TABLE IF EXISTS test.routes_stop;
CREATE TABLE test.routes_stop (
	timeinstant timestamptz NOT NULL,
	enabled bool NULL,
	status text NULL,
	linearrivaltime json NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NULL,
	fiwareservicepath text NULL,
	CONSTRAINT routes_stop_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Routes Stop Lastdata
DROP TABLE IF EXISTS test.routes_stop_lastdata;
CREATE TABLE test.routes_stop_lastdata (
	timeinstant timestamptz NOT NULL,
	"location" public.geometry NULL,
	"name" text NULL,
	category text NULL,
	subcategory text NULL,
	enabled bool NULL,
	status text NULL,
	linearrivaltime json NULL,
	address text NULL,
	zip text NULL,
	"zone" text NULL,
	district text NULL,
	municipality text NULL,
	province text NULL,
	region text NULL,
	community text NULL,
	country text NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NULL,
	fiwareservicepath text NULL,
	addresscommunity text NULL,
	addresscountry text NULL,
	addresslocality text NULL,
	addressregion text NULL,
	postalcode text NULL,
	streetaddress text NULL,
	CONSTRAINT routes_stop_lastdata_pkey PRIMARY KEY (entityid)
);

-- Tourism VF Tourist Destination VF Mutable
DROP TABLE IF EXISTS test.tourismvf_touristdestinationvf_mutable;
CREATE TABLE test.tourismvf_touristdestinationvf_mutable (
	timeinstant timestamptz NOT NULL,
	"day" text NULL,
	"year" float8 NULL,
	"month" float8 NULL,
	"period" text NULL,
	municipalitydestiny text NULL,
	municipalitydestinyid text NULL,
	numberofrow float8 NULL,
	origintype text NULL,
	origin text NULL,
	originid text NULL,
	origincategory text NULL,
	destiny text NULL,
	destinyid text NULL,
	destinycategory text NULL,
	timesection text NULL,
	visitortype text NULL,
	age text NULL,
	gender text NULL,
	purchasingpower text NULL,
	worker text NULL,
	overnights text NULL,
	visitors float8 NULL,
	"source" text NULL,
	municipality text NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NULL,
	fiwareservicepath text NULL
);

-- Error Log
DROP TABLE IF EXISTS test.test_error_log;
CREATE TABLE test.test_error_log (
	"timestamp" timestamp NULL,
	error text NULL,
	query text NULL
);
