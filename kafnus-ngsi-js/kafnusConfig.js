require('dotenv').config();

const baseConfig = {
  'bootstrap.servers': process.env.BOOTSTRAP_SERVERS,
  'sasl.username': process.env.CLUSTER_API_KEY,
  'sasl.password': process.env.CLUSTER_API_SECRET,
  'security.protocol': 'SASL_SSL',
  'sasl.mechanisms': 'PLAIN',
  'group.id': process.env.GROUP_ID || 'ngsi-processor-group'
};

module.exports = { baseConfig };
