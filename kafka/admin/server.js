// Servicio administrador de Kafka: crear, listar, consultar tópicos y grupos.
//   npm run admin  -> http://localhost:3000
const express = require('express');
const { crearKafka } = require('../shared/kafka');
const { definicionTopico } = require('./topicos');
const { PEDIDOS } = require('../shared/topics');

const app = express();
app.use(express.json());
const admin = crearKafka('admin').admin();

// Envuelve cada handler para responder 500 con el mensaje de Kafka si algo falla
const h = fn => (req, res) => fn(req, res).catch(e => res.status(500).json({ error: e.message }));

// POST /admin/topics   { topic, particiones, retencionDias }
app.post('/admin/topics', h(async (req, res) => {
  const { topic, particiones = 1, retencionDias = 7 } = req.body;
  await admin.createTopics({ topics: [definicionTopico({ topic, particiones, retencionDias })] });
  res.status(201).json({ ok: true });
}));

// GET /admin/topics -> nombres + particiones
app.get('/admin/topics', h(async (req, res) => {
  const topics = (await admin.listTopics()).filter(t => !t.startsWith('__'));
  const { topics: meta } = await admin.fetchTopicMetadata({ topics });
  res.json(meta.map(t => ({ topic: t.name, particiones: t.partitions.length })));
}));

// PUT /admin/topics/:t   { retencionDias }  -> alterConfigs
app.put('/admin/topics/:t', h(async (req, res) => {
  await admin.alterConfigs({ resources: [{
    type: 2, // ConfigResourceTypes.TOPIC
    name: req.params.t,
    configEntries: [{ name: 'retention.ms', value: String(req.body.retencionDias * 86400000) }],
  }]});
  res.json({ ok: true });
}));

// DELETE /admin/topics/:t
app.delete('/admin/topics/:t', h(async (req, res) => {
  await admin.deleteTopics({ topics: [req.params.t] });
  res.status(204).end();
}));

// GET /admin/groups -> grupos y sus miembros
app.get('/admin/groups', h(async (req, res) => {
  const { groups } = await admin.listGroups();
  const { groups: detalle } = await admin.describeGroups(groups.map(g => g.groupId));
  res.json(detalle.map(g => ({ groupId: g.groupId, estado: g.state, miembros: g.members.length })));
}));

// GET /admin/groups/:g/lag?topic=pedidos.eventos
// lag = último offset del tópico (fetchTopicOffsets) - offset confirmado del grupo (fetchOffsets)
app.get('/admin/groups/:g/lag', h(async (req, res) => {
  const topic = req.query.topic || PEDIDOS;
  const finales = await admin.fetchTopicOffsets(topic);
  const [confirmados] = await admin.fetchOffsets({ groupId: req.params.g, topics: [topic] });
  const particiones = finales.map(p => {
    const c = confirmados.partitions.find(x => x.partition === p.partition);
    const committed = Number(c.offset) < 0 ? Number(p.low) : Number(c.offset); // -1 = aún no confirma nada
    return { particion: p.partition, final: Number(p.high), confirmado: committed, lag: Number(p.high) - committed };
  });
  res.json({ grupo: req.params.g, topic, lagTotal: particiones.reduce((s, p) => s + p.lag, 0), particiones });
}));

admin.connect().then(() => {
  app.listen(3000, '127.0.0.1', () => console.log('admin escuchando en http://localhost:3000'));
}).catch(e => { console.error(e.message); process.exit(1); });
