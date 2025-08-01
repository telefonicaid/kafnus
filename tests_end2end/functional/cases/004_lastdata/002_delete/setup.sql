-- Drop table
DROP TABLE IF EXISTS test.delete_sensor_lastdata;

-- Create table
CREATE TABLE IF NOT EXISTS test.delete_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT delete_sensor_lastdata_pkey PRIMARY KEY (entityid)
);