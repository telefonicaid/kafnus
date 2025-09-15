/**
 * Copyright 2025 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
 * PROJECT: kafnus
 *
 * This software and / or computer program has been developed by Telefónica Soluciones
 * de Informática y Comunicaciones de España, S.A.U (hereinafter TSOL) and is protected
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

package com.telefonica;


import org.apache.kafka.common.config.ConfigDef;
import org.apache.kafka.connect.connector.ConnectRecord;
import org.apache.kafka.connect.transforms.Transformation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 *
 * HttpErrorToDlq SMT
 *
 * The HttpErrorToDlq transform is a custom Kafka Connect Single Message Transform (SMT) that captures records with HTTP response errors and reroutes them to a dedicated Dead Letter Queue (DLQ) topic.
 * 
 * This is useful when using the Aiven HTTP Sink Connector, which does not natively send failed HTTP requests (e.g. 4xx/5xx responses) to a DLQ.
How it works
 *
 *    The transform checks for the presence of the Kafka Connect header http.response.code, which is added by the HTTP sink connector after each request.
 *
 *    If the status code is 400 or higher, the record is redirected to the configured DLQ topic.
 *
 *    Otherwise, the record passes through unchanged.
 *
 * Parameters:
 *  Name                Type    Importance      Description
 *  dlq.topic.name      string  high            Name of the Kafka topic to which HTTP error records should be redirected.
 *
 */




public class HttpErrorToDlq<R extends ConnectRecord<R>> implements Transformation<R> {

    private String dlqTopic;
    private static final ObjectMapper mapper = new ObjectMapper();
    Logger LOGGER = LoggerFactory.getLogger(HttpErrorToDlq.class);

    @Override
    public R apply(R record) {
        boolean isError = false;

        // 1. Check HTTP status header
        Integer statusCode = null;
        if (record.headers().lastWithName("http.response.code") != null) {
            Object val = record.headers().lastWithName("http.response.code").value();
            if (val instanceof Integer) {
                statusCode = (Integer) val;
            } else if (val instanceof String) {
                try {
                    statusCode = Integer.parseInt((String) val);
                } catch (NumberFormatException ignored) {}
            }
        }
        LOGGER.debug("[HttpErrorToDlq] Got status code: {}", statusCode);
        if (statusCode != null && statusCode >= 400) {
            isError = true;
        }

        // 2. Check payload for GraphQL "errors" field (if statusCode is 200)
        if (!isError && statusCode != null && statusCode == 200) {
            Object value = record.value();
            if (value != null) {
                try {
                    JsonNode root = null;
                    if (value instanceof String) {
                        root = mapper.readTree((String) value);
                    } else {
                        // fallback: serialize value.toString()
                        root = mapper.readTree(value.toString());
                    }
                    if (root.has("errors") && root.get("errors").isArray() && root.get("errors").size() > 0) {
                        isError = true;
                    }
                } catch (IOException e) {
                    // ignore parse errors, treat as non-error
                }
            }
        }

        if (isError) {
            // redirect to DLQ
            return record.newRecord(
                    dlqTopic,
                    null,
                    record.keySchema(),
                    record.key(),
                    record.valueSchema(),
                    record.value(),
                    record.timestamp(),
                    record.headers()
            );
        }

        return record;
    }

    @Override
    public ConfigDef config() {
        return new ConfigDef()
                .define("dlq.topic.name", ConfigDef.Type.STRING, ConfigDef.Importance.HIGH,
                        "Name of the DLQ topic for HTTP/GraphQL error records");
    }

    @Override
    public void configure(Map<String, ?> configs) {
        this.dlqTopic = (String) configs.get("dlq.topic.name");
    }

    @Override
    public void close() {}
}
