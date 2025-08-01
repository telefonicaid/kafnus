-- Drop table
DROP TABLE IF EXISTS test.limit_sensor;

-- Create table
CREATE TABLE IF NOT EXISTS test.limit_sensor (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,

    -- Limit numerical values
    value_real REAL,                        -- ~7 decimal digits
    value_double DOUBLE PRECISION,         -- ~15 decimal digits
    value_numeric NUMERIC(30,15),          -- 30 digits total, 15 after decimal
    value_smallint SMALLINT,               -- 16 bits
    value_integer INTEGER,                 -- 32 bits
    value_bigint BIGINT,                   -- 64 bits

    -- Geometry
    geom_point GEOMETRY(Point, 4326),
    geom_polygon GEOMETRY(Polygon, 4326),
    
    CONSTRAINT limit_sensor_pkey PRIMARY KEY (timeinstant, entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.limit_sensor_lastdata;

-- Create table
CREATE TABLE IF NOT EXISTS test.limit_sensor_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,

    -- Limit numerical values
    value_real REAL,                        -- ~7 decimal digits
    value_double DOUBLE PRECISION,         -- ~15 decimal digits
    value_numeric NUMERIC(30,15),          -- 30 digits total, 15 after decimal
    value_smallint SMALLINT,               -- 16 bits
    value_integer INTEGER,                 -- 32 bits
    value_bigint BIGINT,                   -- 64 bits

    -- Geometry
    geom_point GEOMETRY(Point, 4326),
    geom_polygon GEOMETRY(Polygon, 4326),
    
    CONSTRAINT limit_sensor_lastdata_pkey PRIMARY KEY (entityid)
);

-- Drop table
DROP TABLE IF EXISTS test.limit_sensor_mutable;

-- Create table
CREATE TABLE IF NOT EXISTS test.limit_sensor_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,

    -- Limit numerical values
    value_real REAL,                        -- ~7 decimal digits
    value_double DOUBLE PRECISION,         -- ~15 decimal digits
    value_numeric NUMERIC(30,15),          -- 30 digits total, 15 after decimal
    value_smallint SMALLINT,               -- 16 bits
    value_integer INTEGER,                 -- 32 bits
    value_bigint BIGINT,                   -- 64 bits

    -- Geometry
    geom_point GEOMETRY(Point, 4326),
    geom_polygon GEOMETRY(Polygon, 4326),
    
    CONSTRAINT limit_sensor_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);