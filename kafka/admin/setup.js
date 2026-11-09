// Crea los tópicos definidos en shared/topics.js (npm run topics).
// El mismo código que crea los tópicos se versiona en Git: la configuración queda replicable.
const { crearKafka } = require('../shared/kafka');
const { TOPICOS } = require('../shared/topics');
const { definicionTopico } = require('./topicos');

async function main() {
  const admin = crearKafka('admin').admin();
  await admin.connect();
  const creados = await admin.createTopics({ topics: TOPICOS.map(definicionTopico) });
  console.log(creados ? 'Tópicos creados:' : 'Los tópicos ya existían:', TOPICOS.map(t => t.topic));
  console.log(await admin.listTopics());
  await admin.disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
