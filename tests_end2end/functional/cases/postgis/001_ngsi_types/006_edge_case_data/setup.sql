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
-- Drop and create edge case data test tables
DROP TABLE IF EXISTS test.edgecase_entity;
DROP TABLE IF EXISTS test.edgecase_entity_lastdata;
DROP TABLE IF EXISTS test.edgecase_entity_mutable;

CREATE TABLE IF NOT EXISTS test.edgecase_entity (
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
    CONSTRAINT edgecase_entity_pkey PRIMARY KEY (timeinstant, entityid)
);

CREATE TABLE IF NOT EXISTS test.edgecase_entity_lastdata (
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
    CONSTRAINT edgecase_entity_lastdata_pkey PRIMARY KEY (entityid)
);

CREATE TABLE IF NOT EXISTS test.edgecase_entity_mutable (
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
    CONSTRAINT edgecase_entity_mutable_pkey PRIMARY KEY (timeinstant, entityid)
);