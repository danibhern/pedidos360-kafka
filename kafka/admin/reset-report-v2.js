const { crearKafka } = require('../shared/kafka');
const { PEDIDOS } = require('../shared/topics');

const GROUP_ID = 'report-v2';

async function main() {
  const admin = crearKafka('admin-reset-report-v2').admin();

  await admin.connect();

  try {
    const { groups } = await admin.describeGroups([GROUP_ID]);
    const grupo = groups.find(g => g.groupId === GROUP_ID);

    if (!grupo) {
      throw new Error('No se encontro el grupo report-v2');
    }

    if (grupo.errorCode !== 0) {
      throw new Error(
        `No se pudo consultar el grupo. Codigo: ${grupo.errorCode}`
      );
    }

    if (grupo.members.length > 0) {
      throw new Error(
        'report-v2 sigue activo. Deten todas sus instancias ' +
        'con Control + C y vuelve a intentarlo.'
      );
    }

    console.log(`Grupo: ${GROUP_ID}`);
    console.log(`Topico: ${PEDIDOS}`);
    console.log(`Estado del grupo: ${grupo.state}`);

    const antes = await admin.fetchOffsets({
      groupId: GROUP_ID,
      topics: [PEDIDOS],
    });

    console.log(
      'Offsets anteriores:\n' +
      JSON.stringify(antes, null, 2)
    );

    await admin.resetOffsets({
      groupId: GROUP_ID,
      topic: PEDIDOS,
      earliest: true,
    });

    console.log(
      'Reset completado: report-v2 leera desde el ' +
      'inicio disponible de cada particion.'
    );

    console.log(
      'No se borraron mensajes ni se modificaron ' +
      'los grupos report o audit.'
    );
  } finally {
    await admin.disconnect();
  }
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});