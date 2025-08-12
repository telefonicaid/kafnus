const { createConsumerAgent } = require('./sharedConsumerAgentFactory');
const { createProducer } = require('./sharedProducerFactory');
const { encodeMongo } = require('../utils/ngsiUtils');
const { DateTime } = require('luxon').DateTime;
const { info, error } = require('../utils/logger');

async function startMongoConsumerAgent() {
  const topic = 'raw_mongo';
  const outputTopic = 'tests_mongo';
  const groupId = process.env.GROUP_ID || 'ngsi-processor-mongo';

  const producer = await createProducer();

  const consumer = await createConsumerAgent({
    groupId,
    topic,
    onData: async ({ key, value }) => {
      try {
        const rawValue = value ? value.toString() : null;
        if (!rawValue) return;
        const k = key ? key.toString() : null;
        info(`[mongo] key=${k} value=${rawValue}`);
        const data = JSON.parse(rawValue);
        const headers = data.headers || {};
        const body = data.body || {};
        const attributes = body.attributes || [];

        const fiwareService = headers['fiware-service'] || 'default';
        const servicePath = headers['fiware-servicepath'] || '/';

        // Encode database and collection
        const mongoDb = `sth_${encodeMongo(fiwareService)}`;
        const mongoCollection = `sth_${encodeMongo(servicePath)}`;

        const timestamp = headers.timestamp || Math.floor(Date.now() / 1000);
        const recvTimeTs = String(timestamp * 1000);
        const recvTime = DateTime.fromSeconds(timestamp, { zone: 'utc' }).toISO();

        // Final document
        const doc = {
          recvTimeTs,
          recvTime,
          entityId: body.entityId,
          entityType: body.entityType
        };

        for (const attr of attributes) {
          doc[attr.attrName] = attr.attrValue;
        }

        // Publish in output topic
        await producer.send({
          topic: outputTopic,
          messages: [
            {
              key: JSON.stringify({
                database: mongoDb,
                collection: mongoCollection
              }),
              value: JSON.stringify(doc)
            }
          ]
        });

        info(`[mongo] Sent to '${outputTopic}' | DB: ${mongoDb}, Collection: ${mongoCollection}`);
      } catch (err) {
        error(`[mongo] Error processing event: ${err.message}`);
      }
    }
  });

  return consumer;
}


module.exports = startMongoConsumerAgent;
