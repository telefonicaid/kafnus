const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { info } = require('../utils/logger');

async function startMongoConsumerAgent() {
  const topic = 'raw_mongo';
  const groupId = process.env.GROUP_ID || 'ngsi-processor-mongo';

  const consumer = await createConsumerAgent({ groupId, topic, onData: ({ key, value }) => {
    try {
      const k = key ? key.toString() : null;
      const v = value ? value.toString() : null;
      info(`[mongo] key=${k} value=${v}`);
      // TBD Logic

    } catch (err) {
      console.error('Error proccesing mongo event:', err);
    }
  }});

  return consumer;
}

module.exports = startMongoConsumerAgent;
