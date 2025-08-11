const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { info } = require('../utils/logger');

async function startErrorsConsumerAgent() {
  const topic = 'raw_errors';
  const groupId = process.env.GROUP_ID || 'ngsi-processor-errors';

  const consumer = await createConsumerAgent({ groupId, topic, onData: ({ key, value }) => {
    try {
      const k = key ? key.toString() : null;
      const v = value ? value.toString() : null;
      info(`[errors] key=${k} value=${v}`);

    } catch (err) {
      console.error('Error proccesing event:', err);
    }
  }});

  return consumer;
}

module.exports = startErrorsConsumerAgent;
