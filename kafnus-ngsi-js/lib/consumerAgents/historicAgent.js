const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { info } = require('../utils/logger');

async function startHistoricConsumerAgent() {
  const topic = 'raw_historic';
  const groupId = process.env.GROUP_ID || 'ngsi-processor-historic';

  const consumer = await createConsumerAgent({
    groupId,
    topic,
    onData: ({ key, value }) => {
      try {
        const k = key ? key.toString() : null;
        const v = value ? value.toString() : null; // value_serializer='raw' -> manejado como buffer/str
        info(`[historic] key=${k} value=${v}`);          
        // TBD: logic

          
      } catch (err) {
        console.error('Error proccesing historic event:', err);
      }
    }
  });

  // devolver el consumer para permitir desconexión centralizada si se desea
  return consumer;
}

module.exports = startHistoricConsumerAgent;
