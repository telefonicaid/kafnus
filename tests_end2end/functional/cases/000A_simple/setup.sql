-- Drop table
DROP TABLE IF EXISTS test.simple_sensor;

-- Create table
CREATE TABLE IF NOT EXISTS test.simple_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT simple_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.simple_sensor_lastdata;

-- Create table
CREATE TABLE IF NOT EXISTS test.simple_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT simple_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.simple_sensor_mutable;

-- Create table
CREATE TABLE IF NOT EXISTS test.simple_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT simple_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);