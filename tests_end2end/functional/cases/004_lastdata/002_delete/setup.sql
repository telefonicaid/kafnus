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

-- Insert initial data
INSERT INTO test.delete_sensor_lastdata (recvtime, fiwareservicepath, entityid, entitytype, timeinstant, temperature)
VALUES
    (now(), '/delete', 'sensor1', 'Sensor', '2025-05-15T16:00:00.000Z', 21.0),
    (now(), '/delete', 'sensor2', 'Sensor', '2025-05-15T16:00:00.000Z', 22.0);