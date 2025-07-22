-- Drop table
DROP TABLE IF EXISTS test.parking_zone;

-- Create table
CREATE TABLE test.parking_zone (
	timeinstant timestamptz NOT NULL,
	"location" public.geometry(point) NULL,
	polygon public.geometry(polygon) NULL,
	"name" text NULL,
	zip text NULL,
	"zone" text NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NOT NULL,
	fiwareservicepath text NULL
);
CREATE INDEX parking_zone_idx_gidx ON test.parking_zone USING gist (location);
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
CREATE INDEX parking_zone_lastdata_idx_zip ON test.parking_zone_lastdata USING btree (zip);
CREATE INDEX parking_zone_lastdata_idx_zon ON test.parking_zone_lastdata USING btree (zone);