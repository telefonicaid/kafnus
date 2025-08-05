/**
 * Copyright 2025 Telefónica Soluciones de Informática y Comunicaciones de España, S.A.U.
 * PROJECT: openmetadata-scripts
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


/**
 * Kafka Connect SMT (Single Message Transformation) for routing records to client-specific topics
 * using a header that indicates the destination table.
 *
 * This custom SMT is designed for multi-tenant environments where each client has many tables,
 * potentially resulting in thousands of destination tables. Instead of creating a Kafka topic per table,
 * the strategy here is to:
 *
 * - Use a limited number of topics per client, typically one per data flow (e.g., "historic", "lastdata", etc.).
 * - Include a message header (e.g., `target_table`) that specifies the final destination table.
 * - Dynamically rewrite the record’s topic name using a configured prefix (usually the client name) and
 *   the table name from the header, allowing the sink connector to route records to the correct table.
 *
 * For example, if the Kafnus Connect sink is configured with:
 * - `"table.name.format": "test.${topic}"` (where `test` is the client name)
 * - Header: `target_table = users`
 *
 * Then this SMT will change the record topic to `users`, and the sink connector will insert the record
 * into the `test.users` table.
 *
 * Configuration parameters:
 * - `header.key` (required): Name of the header containing the destination table (e.g., `target_table`).
 * - `topic.prefix` (optional): Prefix to be applied to the target topic (e.g., the client name).
 *
 * Behavior:
 * - If the specified header is present and non-null, the record’s topic is rewritten accordingly.
 * - If the header is missing or empty, the record remains unchanged.
 *
 * This SMT is ideal for client-multi-table architectures where topic explosion is undesirable.
 * It enables clean, dynamic routing with minimal topic creation and integrates seamlessly with
 * sink connectors that support topic-based table naming.
 */



package com.telefonica;

import org.apache.kafka.common.config.ConfigDef;
import org.apache.kafka.connect.connector.ConnectRecord;
import org.apache.kafka.connect.transforms.Transformation;
import org.apache.kafka.connect.transforms.util.SimpleConfig;

import java.util.Map;

public class HeaderRouter<R extends ConnectRecord<R>> implements Transformation<R> {

    public static final String HEADER_KEY_CONFIG = "header.key";
    public static final String TOPIC_PREFIX_CONFIG = "topic.prefix";

    private static final ConfigDef CONFIG_DEF = new ConfigDef()
        .define(HEADER_KEY_CONFIG, ConfigDef.Type.STRING, ConfigDef.Importance.HIGH, "Header key to use for routing")
        .define(TOPIC_PREFIX_CONFIG, ConfigDef.Type.STRING, "", ConfigDef.Importance.LOW, "Prefix for target topic");

    private String headerKey;
    private String topicPrefix;

    @Override
    public void configure(Map<String, ?> configs) {
        SimpleConfig config = new SimpleConfig(CONFIG_DEF, configs);
        this.headerKey = config.getString(HEADER_KEY_CONFIG);
        this.topicPrefix = config.getString(TOPIC_PREFIX_CONFIG);
    }

    @Override
    public R apply(R record) {
        if (record.headers() == null) return record;

        String newTopic = null;
        if (record.headers().lastWithName(headerKey) != null) {
            Object headerValue = record.headers().lastWithName(headerKey).value();
            if (headerValue != null) {
                newTopic = topicPrefix + headerValue.toString();
            }
        }

        if (newTopic != null && !newTopic.isEmpty()) {
            return record.newRecord(
                newTopic,
                record.kafkaPartition(),
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
        return CONFIG_DEF;
    }

    @Override
    public void close() {
        // Nothing to close
    }
}
