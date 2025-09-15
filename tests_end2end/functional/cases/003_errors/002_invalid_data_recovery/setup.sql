-- Drop and create error recovery test tables
DROP TABLE IF EXISTS test.errortest_sensor;
DROP TABLE IF EXISTS test.errortest_sensor_lastdata;
DROP TABLE IF EXISTS test.errortest_sensor_mutable;

CREATE TABLE IF NOT EXISTS test.errortest_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    status TEXT,
    CONSTRAINT errortest_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.errortest_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    status TEXT,
    CONSTRAINT errortest_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.errortest_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    status TEXT,
    CONSTRAINT errortest_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);