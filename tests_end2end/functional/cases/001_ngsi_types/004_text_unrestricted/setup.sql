-- Drop table
DROP TABLE IF EXISTS test.unrestricted_zone;

-- Create table
CREATE TABLE test.unrestricted_zone (
	timeinstant timestamptz NOT NULL,
	dangerousattr text NULL,
	"name" text NULL,
	zip text NULL,
	"zone" text NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NOT NULL,
	fiwareservicepath text NULL
);
