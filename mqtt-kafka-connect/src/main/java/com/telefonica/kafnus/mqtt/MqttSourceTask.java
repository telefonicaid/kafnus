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
 * MQTT Source Task for Kafka Connect.
 *
 * Implements the logic of connecting to an MQTT broker, subscribing to a topic, and receiving messages.
 * Each incoming MQTT message is converted into a Kafka `SourceRecord` and queued for the Kafka Connect framework.
 *
 * Key responsibilities:
 * - Establishes and maintains a blocking MQTT connection (MQTT 5).
 * - Subscribes to the configured MQTT topic.
 * - Parses the topic to extract Fiware service headers.
 * - Handles incoming messages asynchronously and forwards them to Kafka.
 * - Includes retry logic for MQTT connection attempts.
 *
 * This task is designed for PoC/demo scenarios and assumes a fixed topic structure.
 */

package com.telefonica.kafnus.mqtt;

import com.hivemq.client.mqtt.MqttClient;
import com.hivemq.client.mqtt.MqttGlobalPublishFilter;
import com.hivemq.client.mqtt.datatypes.MqttQos;
import com.hivemq.client.mqtt.mqtt5.Mqtt5BlockingClient;
import com.hivemq.client.mqtt.mqtt5.message.publish.Mqtt5Publish;
import org.apache.kafka.connect.source.SourceRecord;
import org.apache.kafka.connect.source.SourceTask;
import org.apache.kafka.connect.header.ConnectHeaders;
import org.apache.kafka.connect.data.Schema;

import java.util.*;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import java.io.StringWriter;
import java.io.PrintWriter;

public class MqttSourceTask extends SourceTask {
    private Mqtt5BlockingClient mqttBlockingClient;
    private BlockingQueue<SourceRecord> queue = new LinkedBlockingQueue<>(1000);
    private String MQTT_BROKER = null;
    private int MQTT_PORT = 1883;
    private String MQTT_TOPIC =  null;

    @Override
    public String version() {
        return "1.0";
    }

    @Override
    public void start(Map<String, String> props) {
        System.out.println("🔧 MqttSourceTask starting...");

        int maxRetries = 5;
        int retryDelay = 3000; // ms
        int attempt = 0;
        boolean connected = false;

        try {
            System.out.println("🔍 Loading config...");
            MqttSourceConfig config = new MqttSourceConfig(props);
            MQTT_BROKER = config.getString(MqttSourceConfig.MQTT_BROKER);
            MQTT_TOPIC = config.getString(MqttSourceConfig.MQTT_TOPIC);
            MQTT_PORT = config.getInt(MqttSourceConfig.MQTT_PORT);

            System.out.printf("📡 Config - Broker: %s, Port: %d, Topic: %s%n", MQTT_BROKER, MQTT_PORT, MQTT_TOPIC);
        } catch (Exception e) {
            System.err.println("❌ Failed to parse config: " + e.getMessage());
            throw new RuntimeException(e);
        }

        while (attempt < maxRetries && !connected) {
            try {
                System.out.printf("🔌 Attempt %d to connect to MQTT broker at %s:%d...%n", attempt, MQTT_BROKER, MQTT_PORT);
                attempt++;
                // Create and connect blocking client
                mqttBlockingClient = MqttClient.builder()
                        .useMqttVersion5()
                        .identifier("kafka-connect-" + UUID.randomUUID())
                        .serverHost(MQTT_BROKER)
                        .serverPort(MQTT_PORT)
                        .buildBlocking();

                mqttBlockingClient.connectWith()
                .cleanStart(true)
                .keepAlive(30)
                .send();
                System.out.println("🔗 MQTT connect() called.");
                System.out.println("🔍 Client config: " + mqttBlockingClient.getConfig());
                System.out.println("🔍 Client state: " + mqttBlockingClient.getState());


                // Verify connection state
                if (mqttBlockingClient.getState().isConnected()) {
                    connected = true;
                    System.out.println("✅ Connected to MQTT broker (Attempt " + attempt + ")");

                    // Subscribe to hardcoded topic
                    mqttBlockingClient.subscribeWith()
                            .topicFilter(MQTT_TOPIC)
                            .qos(MqttQos.AT_LEAST_ONCE)
                            .send();

                    System.out.println("Subscribed to " + MQTT_TOPIC);

                    // Setup async message handling
                    mqttBlockingClient.toAsync().publishes(
                            MqttGlobalPublishFilter.ALL,
                            this::handleMessage
                    );
                } else {
                    System.err.println("❌ MQTT client is not connected after connect() call");
                }
            } catch (Exception e) {
                System.err.println("⚠️ Connection failed (Attempt " + attempt + "): " + e.getMessage());
                StringWriter sw = new StringWriter();
                e.printStackTrace(new PrintWriter(sw));
                System.out.println("📋 Stacktrace:\n" + sw.toString());
                if (mqttBlockingClient != null) {
                    mqttBlockingClient.disconnect();
                }
            }

            if (!connected && attempt < maxRetries) {
                try {
                    System.out.println("🔄 Retrying in " + retryDelay + "ms...");
                    Thread.sleep(retryDelay);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                }
            }
        }

        if (!connected) {
            throw new RuntimeException("Failed to connect after " + maxRetries + " attempts");
        }
    }

    private void handleMessage(Mqtt5Publish message) {
        var inTopic = message.getTopic().toString();
        System.out.println("📨 Received MQTT message on topic: " + inTopic);

        String[] inTopicParts = inTopic.split("/");
        if (inTopicParts.length == 4) {
            String fiware_service = inTopicParts[1];
            String fiware_servicepath =inTopicParts[2];
            String destination_topic = inTopicParts[inTopicParts.length - 1];

            try {
                ConnectHeaders headers = new ConnectHeaders();

                // Hardcoded FiWARE values for PoC
                headers.addString("fiware-service", fiware_service);
                headers.addString("fiware-servicepath", fiware_servicepath);

                String payload = new String(message.getPayloadAsBytes());

                SourceRecord record = new SourceRecord(
                        Collections.singletonMap("mqtt_topic", message.getTopic().toString()),
                        Collections.singletonMap("timestamp", System.currentTimeMillis()),
                        destination_topic,  // Using hardcoded Kafka topic
                        null,
                        Schema.STRING_SCHEMA,
                        null,
                        Schema.STRING_SCHEMA,
                        new String(message.getPayloadAsBytes()),
                        System.currentTimeMillis(),
                        headers
                );

                System.out.println("➡️ Forwarding to Kafka topic: " + destination_topic + " | Payload: " + payload);
                queue.offer(record);

            } catch (Exception e) {
                System.err.println("❌ Failed to handle message: " + e.getMessage());
            }
        }
        else{
            System.err.println("❗ Topic format unexpected, skipping: " + inTopic);
        }
    }

    @Override
    public List<SourceRecord> poll() throws InterruptedException {
        List<SourceRecord> records = new ArrayList<>();
        SourceRecord record = queue.poll(1000, TimeUnit.MILLISECONDS);

        if (record != null) {
            records.add(record);
            queue.drainTo(records, 99);  // Batch up to 100 records
        }
        return records;
    }

    @Override
    public void stop() {
        if (mqttBlockingClient != null && mqttBlockingClient.getState().isConnected()) {
            mqttBlockingClient.disconnect();
            System.out.println("Disconnected from MQTT broker");
        }
    }
}