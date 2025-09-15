-- Drop and create edge case data test tables
DROP TABLE IF EXISTS test.edgecases_entity;
DROP TABLE IF EXISTS test.edgecases_entity_lastdata;
DROP TABLE IF EXISTS test.edgecases_entity_mutable;

CREATE TABLE IF NOT EXISTS test.edgecases_entity (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    zero_value DOUBLE PRECISION,
    empty_text TEXT,
    large_number BIGINT,
    special_chars TEXT,
    unicode_text TEXT,
    CONSTRAINT edgecases_entity_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.edgecases_entity_lastdata (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    zero_value DOUBLE PRECISION,
    empty_text TEXT,
    large_number BIGINT,
    special_chars TEXT,
    unicode_text TEXT,
    CONSTRAINT edgecases_entity_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.edgecases_entity_mutable (
    recvtime TIMESTAMPTZ NOT NULL DEFAULT now(),
    fiwareservicepath TEXT,
    entityid TEXT,
    entitytype TEXT,
    timeinstant TIMESTAMPTZ,
    zero_value DOUBLE PRECISION,
    empty_text TEXT,
    large_number BIGINT,
    special_chars TEXT,
    unicode_text TEXT,
    CONSTRAINT edgecases_entity_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);