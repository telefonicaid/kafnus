-- test.lighting_streetlight definition

-- Drop table
DROP TABLE IF EXISTS test.lighting_streetlight;
-- Create Table
CREATE TABLE test.lighting_streetlight (
    timeinstant            timestamptz NOT NULL,
    recvtime               timestamptz NOT NULL,
    entityid               text NOT NULL,
    entitytype             text NULL,
    fiwareservicepath      text NULL,
    location               geometry(Point, 4326) NULL,
    address                text NULL,
    illuminancelevel       float8 NULL,
    enablehistoriccommand  boolean NULL,
    variables              jsonb NULL,
    fixtureconfiguration   json NULL,
    maintaineremail        text NULL,
    lumensadjustment       float8 NULL,
    fixturemodelid         bigint NULL,
    ledcount               bigint NULL,
    wattageconsumption     float NULL,
    colortempkelvin        float8 NULL,
    beamangle              float8 NULL,
    luminousefficacy       float NULL,
    installationid         bigint NULL,
    compatiblefixtures     json NULL,
    dimminglevels          json NULL,
    temperaturerangek      json NULL,
	CONSTRAINT lighting_streetlight_pkey PRIMARY KEY (timeinstant, entityid)
);
CREATE INDEX lighting_streetlight_idx_ld ON test.lighting_streetlight USING btree (entityid, timeinstant DESC);
CREATE INDEX lighting_streetlight_timeinstant_idx ON test.lighting_streetlight USING btree (timeinstant DESC);

-- Table Triggers
-- create trigger ts_insert_blocker before
-- insert
--     on
--     test.lighting_streetlight for each row execute function _timescaledb_internal.insert_blocker();


-- test.lighting_streetlight_lastdata definition

-- Drop table
DROP TABLE IF EXISTS test.lighting_streetlight_lastdata;
-- Create Table
CREATE TABLE test.lighting_streetlight_lastdata (
    timeinstant            timestamptz NOT NULL,
    recvtime               timestamptz NOT NULL,
    entityid               text NOT NULL,
    entitytype             text NULL,
    fiwareservicepath      text NULL,
    location               geometry(Point, 4326) NULL,
    address                text NULL,
    illuminancelevel       float8 NULL,
    enablehistoriccommand  boolean NULL,
    variables              jsonb NULL,
    fixtureconfiguration   json NULL,
    maintaineremail        text NULL,
    lumensadjustment       float8 NULL,
    fixturemodelid         bigint NULL,
    ledcount               bigint NULL,
    wattageconsumption     float NULL,
    colortempkelvin        float8 NULL,
    beamangle              float8 NULL,
    luminousefficacy       float NULL,
    installationid         bigint NULL,
    compatiblefixtures     json NULL,
    dimminglevels          json NULL,
    temperaturerangek      json NULL,
	CONSTRAINT lighting_streetlight_lastdata_pkey PRIMARY KEY (entityid)
);

-- test.lighting_streetlight_lastdata definition

-- Drop table
DROP TABLE IF EXISTS test.lighting_streetlight_mutable;
-- Create Table
CREATE TABLE test.lighting_streetlight_mutable (
    timeinstant            timestamptz NOT NULL,
    recvtime               timestamptz NOT NULL,
    entityid               text NOT NULL,
    entitytype             text NULL,
    fiwareservicepath      text NULL,
    location               geometry(Point, 4326) NULL,
    address                text NULL,
    illuminancelevel       float8 NULL,
    enablehistoriccommand  boolean NULL,
    variables              jsonb NULL,
    fixtureconfiguration   json NULL,
    maintaineremail        text NULL,
    lumensadjustment       float8 NULL,
    fixturemodelid         bigint NULL,
    ledcount               bigint NULL,
    wattageconsumption     float NULL,
    colortempkelvin        float8 NULL,
    beamangle              float8 NULL,
    luminousefficacy       float NULL,
    installationid         bigint NULL,
    compatiblefixtures     json NULL,
    dimminglevels          json NULL,
    temperaturerangek      json NULL,
	CONSTRAINT lighting_streetlight_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);