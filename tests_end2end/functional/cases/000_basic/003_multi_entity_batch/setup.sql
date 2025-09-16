-- Drop and create sensor tables
DROP TABLE IF EXISTS test.multientity_sensor;
DROP TABLE IF EXISTS test.multientity_sensor_lastdata;
DROP TABLE IF EXISTS test.multientity_sensor_mutable;

CREATE TABLE IF NOT EXISTS test.multientity_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT multientity_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.multientity_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT multientity_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.multientity_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT multientity_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Drop and create streetlight tables
DROP TABLE IF EXISTS test.multientity_streetlight;
DROP TABLE IF EXISTS test.multientity_streetlight_lastdata;
DROP TABLE IF EXISTS test.multientity_streetlight_mutable;

CREATE TABLE IF NOT EXISTS test.multientity_streetlight (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    luminosity INTEGER,
    status TEXT,
    CONSTRAINT multientity_streetlight_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.multientity_streetlight_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    luminosity INTEGER,
    status TEXT,
    CONSTRAINT multientity_streetlight_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.multientity_streetlight_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    luminosity INTEGER,
    status TEXT,
    CONSTRAINT multientity_streetlight_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);