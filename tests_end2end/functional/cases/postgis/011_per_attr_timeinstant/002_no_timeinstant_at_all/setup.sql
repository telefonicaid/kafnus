-- Historic: no TimeInstant provided at all; timeinstant must still be filled in (recvtime fallback)
DROP TABLE IF EXISTS test.no_ti_sensor;
CREATE TABLE IF NOT EXISTS test.no_ti_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT no_ti_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Mutable: same primary key shape, same guarantee applies
DROP TABLE IF EXISTS test.no_ti_sensor_mutable;
CREATE TABLE IF NOT EXISTS test.no_ti_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    humidity DOUBLE PRECISION,
    CONSTRAINT no_ti_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);
