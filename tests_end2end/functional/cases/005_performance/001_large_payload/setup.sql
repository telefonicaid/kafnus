-- Drop and create performance test tables
DROP TABLE IF EXISTS test.performance_sensor;
DROP TABLE IF EXISTS test.performance_sensor_lastdata;
DROP TABLE IF EXISTS test.performance_sensor_mutable;

CREATE TABLE IF NOT EXISTS test.performance_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    light_level INTEGER,
    battery_level INTEGER,
    data_payload JSONB,
    CONSTRAINT performance_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.performance_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    light_level INTEGER,
    battery_level INTEGER,
    data_payload JSONB,
    CONSTRAINT performance_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.performance_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    pressure DOUBLE PRECISION,
    light_level INTEGER,
    battery_level INTEGER,
    data_payload JSONB,
    CONSTRAINT performance_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);