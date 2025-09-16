-- Drop and create error recovery test tables
DROP TABLE IF EXISTS test.errorrecovery_sensor;
DROP TABLE IF EXISTS test.errorrecovery_sensor_lastdata;
DROP TABLE IF EXISTS test.errorrecovery_sensor_mutable;

CREATE TABLE IF NOT EXISTS test.errorrecovery_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    status TEXT,
    CONSTRAINT errorrecovery_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.errorrecovery_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    status TEXT,
    CONSTRAINT errorrecovery_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.errorrecovery_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    status TEXT,
    CONSTRAINT errorrecovery_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);