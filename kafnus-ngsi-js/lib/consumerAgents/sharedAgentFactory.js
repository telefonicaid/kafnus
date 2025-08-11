// (optional) factory to create consumers
const Kafka = require('@confluentinc/kafka-javascript');
const { baseConfig } = require('../kafkaConfig');
const { info, error } = require('../utils/logger');

function createConsumerAgent({ groupId, topic, onData }) {
  const config = { ...baseConfig, 'group.id': groupId };
  const consumer = new Kafka.KafkaConsumerAgent(config, { 'auto.offset.reset': process.env.AUTO_OFFSET_RESET || 'earliest' });

  return new Promise((resolve, reject) => {
    consumer
      .on('ready', () => {
        consumer.subscribe([topic]);
        consumer.consume();
        info(`ConsumerAgent ready — topic=${topic} group=${config['group.id']}`);
        resolve(consumer);
      })
      .on('data', onData)
      .on('event.error', (err) => {
        error(`Event error on topic ${topic}:`, err);
      })
      .on('disconnected', () => {
        info(`ConsumerAgent disconnected from topic ${topic}`);
      });

    try {
      consumer.connect();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { createConsumerAgent };
