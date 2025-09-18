-- Drop and create subscription pattern test tables
DROP TABLE IF EXISTS test.pattern_sensor;
DROP TABLE IF EXISTS test.pattern_sensor_lastdata;
DROP TABLE IF EXISTS test.pattern_sensor_mutable;

CREATE TABLE IF NOT EXISTS test.pattern_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    value1 DOUBLE PRECISION,
    value2 INTEGER,
    CONSTRAINT pattern_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.pattern_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    value1 DOUBLE PRECISION,
    value2 INTEGER,
    CONSTRAINT pattern_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.pattern_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    value1 DOUBLE PRECISION,
    value2 INTEGER,
    CONSTRAINT pattern_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);