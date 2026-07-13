-- Historic: one row per distinct per-attribute TimeInstant
DROP TABLE IF EXISTS test.split_sensor;
CREATE TABLE IF NOT EXISTS test.split_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT split_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Lastdata: single latest row (must NOT be split)
DROP TABLE IF EXISTS test.split_sensor_lastdata;
CREATE TABLE IF NOT EXISTS test.split_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT split_sensor_lastdata_pkey PRIMARY KEY (entityid)
);
