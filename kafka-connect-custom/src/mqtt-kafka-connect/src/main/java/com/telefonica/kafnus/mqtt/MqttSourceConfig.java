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
 * Configuration definition for the MQTT Source Connector.
 *
 * Declares and validates the configuration properties required to connect to an MQTT broker and forward messages to Kafka.
 * The configuration includes:
 * - MQTT broker host
 * - MQTT broker port
 * - MQTT subscription topic
 * - Kafka destination topic
 *
 * Used by both the connector and its tasks to initialize with the correct parameters.
 */

package com.telefonica.kafnus.mqtt;

import org.apache.kafka.common.config.AbstractConfig;
import org.apache.kafka.common.config.ConfigDef;

import java.util.Map;

public class MqttSourceConfig extends AbstractConfig {
    public static final String MQTT_BROKER = "mqtt.broker";
    public static final String MQTT_TOPIC = "mqtt.topic";
    public static final String KAFKA_TOPIC = "kafka.topic";
    public static final String MQTT_PORT = "mqtt.port";

    public MqttSourceConfig(Map<String, String> originals) {
        super(configDef(), originals);
    }

    public static ConfigDef configDef() {
        return new ConfigDef()
                .define(MQTT_BROKER, ConfigDef.Type.STRING, "tcp://localhost:1883",
                        ConfigDef.Importance.HIGH, "MQTT Broker URL")
                .define(MQTT_TOPIC, ConfigDef.Type.STRING,
                        ConfigDef.Importance.HIGH, "MQTT Topic to subscribe")
                .define(KAFKA_TOPIC, ConfigDef.Type.STRING,
                        ConfigDef.Importance.HIGH, "Destination Kafka topic")
                .define(MQTT_PORT, ConfigDef.Type.INT, 1883,
                        ConfigDef.Importance.MEDIUM, "MQTT Broker Port");
    }
}