-- Drop table
DROP TABLE IF EXISTS test.access_errors;

-- Create table
CREATE TABLE IF NOT EXISTS test.access_errors (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,

    -- Fields with expected types
    bool_col BOOLEAN,         -- ❌
    text_col TEXT,            -- ❌
    not_null_col TEXT NOT NULL, -- ❌
    int_col INTEGER,                   -- ❌
    double_not_null DOUBLE PRECISION NOT NULL,                   -- ❌
    averagestay DOUBLE PRECISION,     -- ✅

    CONSTRAINT access_errors_pkey PRIMARY KEY (timeinstant, entityid)
);
