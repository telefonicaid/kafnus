/*
 * Copyright 2025 Telefonica Soluciones de Informatica y Comunicaciones de España, S.A.U.
 * PROJECT: Kafnus
 *
 * This software and / or computer program has been developed by Telefonica Soluciones
 * de Informatica y Comunicaciones de España, S.A.U (hereinafter TSOL) and is protected
 * as copyright by the applicable legislation on intellectual property.
 *
 * It belongs to TSOL, and / or its licensors, the exclusive rights of reproduction,
 * distribution, public communication and transformation, and any economic right on it,
 * all without prejudice of the moral rights of the authors mentioned above. It is expressly
 * forbidden to decompile, disassemble, reverse engineer, sublicense or otherwise transmit
 * by any means, translate or create derivative works of the software and / or computer
 * programs, and perform with respect to all or part of such programs, any type of exploitation.
 *
 * Any use of all or part of the software and / or computer program will require the
 * express written consent of TSOL. In all cases, it will be necessary to make
 * an express reference to TSOL ownership in the software and / or computer
 * program.
 *
 * Non-fulfillment of the provisions set forth herein and, in general, any violation of
 * the peaceful possession and ownership of these rights will be prosecuted by the means
 * provided in both Spanish and international law. TSOL reserves any civil or
 * criminal actions it may exercise to protect its rights.
*/
-- Drop table
DROP TABLE IF EXISTS test.date_zone;

-- Create table
CREATE TABLE test.date_zone (
	timeinstant timestamptz NOT NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NOT NULL,
	fiwareservicepath text NULL,
	timeinstant_tz        timestamptz,       -- with time zone
	timeinstant_no_tz     timestamp,         -- without time zone
	timeinstant_wo_tz     timestamp without time zone  -- explicitly without time zone
);

-- Drop table
DROP TABLE IF EXISTS test.date_zone_lastdata;

-- Create table
CREATE TABLE test.date_zone_lastdata (
	timeinstant timestamptz NULL,
	entityid text NOT NULL,
	entitytype text NULL,
	recvtime timestamptz NULL,
	fiwareservicepath text NULL,
	timeinstant_tz        timestamptz,       -- with time zone
	timeinstant_no_tz     timestamp,         -- without time zone
	timeinstant_wo_tz     timestamp without time zone,  -- explicitly without time zone
	CONSTRAINT date_zone_lastdata_pkey PRIMARY KEY (entityid)
);