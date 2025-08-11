const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { info } = require('../utils/logger');

async function startMutableConsumerAgent() {
  const topic = 'raw_mutable';
  const groupId = process.env.GROUP_ID || 'ngsi-processor-mutable';

  const consumer = await createConsumerAgent({ groupId, topic, onData: ({ key, value }) => {
    try {
      const k = key ? key.toString() : null;
      const v = value ? value.toString() : null;
      info(`[mutable] key=${k} value=${v}`);
      // TBD logic

    } catch (err) {
      console.error('Error proccessing mutable event:', err);
    }
  }});

  return consumer;
}

module.exports = startMutableConsumerAgent;
