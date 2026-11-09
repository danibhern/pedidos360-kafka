// Solo reconstrucción local: no elimina mensajes, tópicos ni tablas DynamoDB.
const { crearKafka } = require('../shared/kafka');
const { PEDIDOS } = require('../shared/topics');

async function main() {
  const admin = crearKafka('rebuild-local-views').admin();
  await admin.connect();
  try {
    const groups = ['report', 'audit'];
    const result = await admin.describeGroups(groups);
    for (const group of result.groups) {
      if (group.members.length > 0 ||
          !['Empty', 'Dead'].includes(group.state)) {
        throw new Error(`Detén report y audit antes: ${group.groupId} está ${group.state}.`);
      }
    }
    const existing = new Set((await admin.listGroups()).groups.map(group => group.groupId));
    for (const groupId of groups) {
      if (!existing.has(groupId)) continue; // Un grupo nuevo ya lee desde el inicio.
      await admin.resetOffsets({ groupId, topic: PEDIDOS, earliest: true });
      console.log(`[rebuild] ${groupId}: releerá ${PEDIDOS} desde lo retenido.`);
    }
    console.log('Ahora inicia un solo report y un solo audit. No ejecutes el productor de nuevo.');
  } finally {
    await admin.disconnect();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
