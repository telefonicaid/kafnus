const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { info, error } = require('../utils/logger');

async function startMutableConsumerAgent() {
  const topic = 'raw_mutable';
  const groupId = process.env.GROUP_ID || 'ngsi-processor-mutable';

  const consumer = await createConsumerAgent({
   groupId,
   topic,
     onData: async ({ key, value, headers }) => {
      const start = Date.now();
      const k = key?.toString() || '';
      const v = value?.toString() || '';
      info(`[raw_historic] Key: ${k}, Value: ${v}`);

      try {
          info(`rawValue: '${v}'`);
        await handleEntityCb(v, {
          headers,
          suffix: '_mutable',
          includeTimeinstant: true,
          keyFields: ['entityid'],
          datamodel: process.env.DATAMODEL || 'dm-by-entity-type-database'
        });
      } catch (err) {
        error(` [mutable] Error processing event: ${err}`);
      }

      const duration = (Date.now() - start) / 1000;
      // TBD Metrics
    }
  });

  return consumer;
}

module.exports = startMutableConsumerAgent;
