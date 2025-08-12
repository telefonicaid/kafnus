const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { info, error } = require('../utils/logger');

async function startLastdataConsumerAgent() {
  const topic = 'raw_lastdata';
  const groupId = process.env.GROUP_ID || 'ngsi-processor-lastdata';

  const consumer = await createConsumerAgent({ groupId, topic, onData: ({ key, value }) => {
    try {
      const k = key ? key.toString() : null;
      const v = value ? value.toString() : null;
      info(`[lastdata] key=${k} value=${v}`);
      // TBD logic

        
    } catch (err) {
      error('Error processing lastdata event:', err);
    }
  }});

  return consumer;
}

module.exports = startLastdataConsumerAgent;
