-- Drop table
DROP TABLE IF EXISTS test.order_sensor_lastdata;

-- Create table
CREATE TABLE IF NOT EXISTS test.order_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL,
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    temperature DOUBLE PRECISION,
    CONSTRAINT order_sensor_lastdata_pkey PRIMARY KEY (entityid)
);
