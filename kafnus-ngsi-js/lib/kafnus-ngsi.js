require('dotenv').config();
const { info } = require('./utils/logger');

const startHistoricConsumerAgent = require('./consumerAgents/historicConsumerAgent');
const startLastdataConsumerAgent = require('./consumerAgents/lastdataConsumerAgent');
const startMutableConsumerAgent = require('./consumerAgents/mutableConsumerAgent');
const startErrorsConsumerAgent = require('./consumerAgents/errorsConsumerAgent');
const startMongoConsumerAgent = require('./consumerAgents/mongoConsumerAgent');

async function main() {
  info('Starting all consumers...');

  const started = await Promise.all([
    startHistoricConsumerAgent(),
    startLastdataConsumerAgent(),
    startMutableConsumerAgent(),
    startErrorsConsumerAgent(),
    startMongoConsumerAgent()
  ]);

  const consumers = started.filter(Boolean);

  // Graceful shutdown
  const shutdown = async () => {
      info('Shutting down consumers(agents)...');
    await Promise.all(consumers.map(c => new Promise((resolve) => {
      try {
        c.disconnect();
      } catch (err) { /* ignore */ }
      resolve();
    })));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('Error starting consumers:', err);
  process.exit(1);
});
