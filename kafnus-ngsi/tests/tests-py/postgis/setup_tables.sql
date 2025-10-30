/*
 * Copyright 2025 Telefonica Soluciones de Informatica y Comunicaciones de Espa�a, S.A.U.
 * PROJECT: Kafnus
 *
 * This software and / or computer program has been developed by Telefónica Soluciones
 * de Informática y Comunicaciones de España, S.A.U (hereinafter TSOL) and is protected
 * as copyright by the applicable legislation on intellectual property.
 *
 * It belongs to TSOL, and / or its licensors, the exclusive rights of reproduction,
 * distribution, public communication and transformation, and any economic right on it,
 * all without prejudice of the moral rights of the authors mentioned above. It is expressly
 * forbidden to decompile, disassemble, reverse engineer, sublicense or otherwise transmit
 * by any means, translate or create derivative works of the software and / or computer
 * programs, and perform with respect to all or part of such programs, any type of exploitation.
 *
 * Any use of all or part of the software and / or computer program will require the
 * express written consent of TSOL. In all cases, it will be necessary to make
 * an express reference to TSOL ownership in the software and / or computer
 * program.
 *
 * Non-fulfillment of the provisions set forth herein and, in general, any violation of
 * the peaceful possession and ownership of these rights will be prosecuted by the means
 * provided in both Spanish and international law. TSOL reserves any civil or
 * criminal actions it may exercise to protect its rights.
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
