/*
* Copyright 2026 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
*
* This file is part of kafnus
*
* kafnus is free software: you can redistribute it and/or
* modify it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* kafnus is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
* General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with kafnus. If not, see http://www.gnu.org/licenses/.
*/

-- Set changecolumn to NULL
UPDATE test.change_schema
    SET changecolumn = NULL
    WHERE changecolumn IS NOT NULL;

UPDATE test.change_schema_lastdata
    SET changecolumn = NULL
    WHERE changecolumn IS NOT NULL;

UPDATE test.change_schema_mutable
    SET changecolumn = NULL
    WHERE changecolumn IS NOT NULL;

-- Change types and add new column
ALTER TABLE test.change_schema
    ADD COLUMN IF NOT EXISTS pressure DOUBLE PRECISION,
    ALTER COLUMN temperature TYPE TEXT USING temperature::TEXT;

ALTER TABLE test.change_schema_lastdata
    ADD COLUMN IF NOT EXISTS pressure DOUBLE PRECISION,
    ALTER COLUMN temperature TYPE TEXT USING temperature::TEXT;

ALTER TABLE test.change_schema_mutable
    ADD COLUMN IF NOT EXISTS pressure DOUBLE PRECISION,
    ALTER COLUMN temperature TYPE TEXT USING temperature::TEXT;

-- Rename column
ALTER TABLE test.change_schema
    RENAME COLUMN rename_column TO renamecolumn;

ALTER TABLE test.change_schema_lastdata
    RENAME COLUMN rename_column TO renamecolumn;

ALTER TABLE test.change_schema_mutable
    RENAME COLUMN rename_column TO renamecolumn;

-- Drop column
ALTER TABLE test.change_schema
    DROP COLUMN IF EXISTS drop_column;

ALTER TABLE test.change_schema_lastdata
    DROP COLUMN IF EXISTS drop_column;

ALTER TABLE test.change_schema_mutable
    DROP COLUMN IF EXISTS drop_column;