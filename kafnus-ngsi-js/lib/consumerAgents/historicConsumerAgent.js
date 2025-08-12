const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { info, error } = require('../utils/logger');
const handleEntityCb = require('../utils/handleEntityCb');

async function startHistoricConsumerAgent() {
  const topic = 'raw_historic';
  const groupId = process.env.GROUP_ID || 'ngsi-processor-historic';

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
          suffix: '',
          includeTimeinstant: true,
          keyFields: ['entityid'],
          datamodel: process.env.DATAMODEL || 'dm-by-entity-type-database'
        });
      } catch (err) {
        error(` [historic] Error processing event: ${err}`);
      }

      const duration = (Date.now() - start) / 1000;
      // TBD Metrics
      // messagesProcessed.labels({ flow: 'historic' }).inc();
      // processingTime.labels({ flow: 'historic' }).set(duration);
    }
  });

  return consumer;
}

module.exports = startHistoricConsumerAgent;
