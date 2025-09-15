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

import java.util.Map;

/**
 * SMT que redirige mensajes con errores HTTP al tópico DLQ configurado.
 * Se asume que el conector Aiven HTTP Sink añade un header "http.response.code".
 */
public class HttpErrorToDlq<R extends ConnectRecord<R>> implements Transformation<R> {

    private String dlqTopic;

    @Override
    public R apply(R record) {
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

        if (statusCode != null && statusCode >= 400) {
            // Redirect message to DLQ
            return record.newRecord(
                    dlqTopic,                       // topic target
                    null,                           // partition
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
                        "Topic name for DLQ messages with HTTP error");
    }

    @Override
    public void configure(Map<String, ?> configs) {
        this.dlqTopic = (String) configs.get("dlq.topic.name");
    }

    @Override
    public void close() {}
}
