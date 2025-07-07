-- setup_tests.sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE SCHEMA IF NOT EXISTS test;

-- Drop table
DROP TABLE IF EXISTS test.test_error_log;

CREATE TABLE test.test_error_log (
    "timestamp" TIMESTAMP NOT NULL,
    error TEXT NOT NULL,
    query TEXT NULL
);