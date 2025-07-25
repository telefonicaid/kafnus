-- Drop table
DROP TABLE IF EXISTS test.types_zone;

-- Create table
CREATE TABLE IF NOT EXISTS test.types_zone (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,

    -- Basic JSON types mapped to PG types
    str_col TEXT,
    number_col DOUBLE PRECISION,
    bool_col BOOLEAN,
    null_col TEXT,
    obj_col JSONB,
    array_col JSONB,

    CONSTRAINT types_zone_pkey PRIMARY KEY (timeinstant, entityid)
);