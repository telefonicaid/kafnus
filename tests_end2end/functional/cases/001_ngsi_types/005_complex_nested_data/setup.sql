-- Drop and create complex data sensor tables
DROP TABLE IF EXISTS test.complexdata_device;
DROP TABLE IF EXISTS test.complexdata_device_lastdata;  
DROP TABLE IF EXISTS test.complexdata_device_mutable;

CREATE TABLE IF NOT EXISTS test.complexdata_device (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    configuration JSONB,
    measurements JSONB,
    metadata JSONB,
    tags TEXT[],
    CONSTRAINT complexdata_device_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.complexdata_device_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    configuration JSONB,
    measurements JSONB,
    metadata JSONB,
    tags TEXT[],
    CONSTRAINT complexdata_device_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.complexdata_device_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    configuration JSONB,
    measurements JSONB,
    metadata JSONB,
    tags TEXT[],
    CONSTRAINT complexdata_device_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);