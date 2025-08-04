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