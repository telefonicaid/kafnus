/*
 * Copyright 2025 Telefonica Soluciones de Informatica y Comunicaciones de España, S.A.U.
 * PROJECT: Kafnus
 *
 * This software and / or computer program has been developed by Telefonica Soluciones
 * de Informatica y Comunicaciones de España, S.A.U (hereinafter TSOL) and is protected
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