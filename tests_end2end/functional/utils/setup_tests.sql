-- setup_tests.sql
CREATE EXTENSION IF NOT EXISTS postgis;

-- Drop schema
DROP SCHEMA IF EXISTS test CASCADE;
-- Create schema
CREATE SCHEMA test;

-- Create table for error logging
CREATE TABLE test.test_error_log (
    "timestamp" TIMESTAMPTZ NOT NULL,
    error TEXT NOT NULL,
    query TEXT NULL
);