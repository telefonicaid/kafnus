// sharedProducerFactory.js
const Kafka = require('@confluentinc/kafka-javascript');
const { baseConfig } = require('../../kafnusConfig');
const { info, error } = require('../utils/logger');

function createProducer() {
  const producer = new Kafka.Producer(baseConfig);

  return new Promise((resolve, reject) => {
    producer
      .on('ready', () => {
        info('Producer ready');
        resolve(producer);
      })
      .on('event.error', (err) => {
        error('Producer error:', err);
      })
      .on('delivery-report', (err, report) => {
        if (err) {
          error('Delivery report error:', err);
        } else {
          info(`Message delivered to topic ${report.topic} [${report.partition}] at offset ${report.offset}`);
        }
      })
      .on('disconnected', () => {
        info('Producer disconnected');
      });

    try {
      producer.connect();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { createProducer };
