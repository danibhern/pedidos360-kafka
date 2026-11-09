const { Partitioners } = require('kafkajs');

const { iniciarConsumidor } = require('../shared/consumidor');
const { crearKafka } = require('../shared/kafka');
const { AUDIT_TIMELINE } = require('../shared/topics');
const { iniciarHttp } = require('./http');

const tabla = [];
const vistos = new Set();

const port = Number(process.env.PORT || 3002);

const origenFrontend =
  process.env.FRONTEND_ORIGIN || 'http://localhost:4200';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT debe ser un entero entre 1 y 65535');
}

const productorTimeline = crearKafka('audit-timeline').producer({
  idempotent: true,
  maxInFlightRequests: 1,
  createPartitioner: Partitioners.DefaultPartitioner,
});

function obtenerEventos() {
  return [...tabla];
}

async function procesar(evento) {
  if (vistos.has(evento.eventId)) {
    console.log(
      `[audit] duplicado ignorado: ${evento.eventId}`
    );
    return;
  }

  const registro = {
    pedidoId: evento.pedidoId,
    quien: `${evento.actor.usuario} (${evento.actor.rol})`,
    que: evento.tipo,
    cuando: evento.fecha,
    desdeDonde: evento.origen,
    eventId: evento.eventId,
  };

  await productorTimeline.send({
    topic: AUDIT_TIMELINE,
    acks: -1,
    messages: [
      {
        key: evento.pedidoId,
        value: JSON.stringify(registro),
        headers: {
          eventId: evento.eventId,
        },
      },
    ],
  });

  tabla.push(evento);
  vistos.add(evento.eventId);

  const timeline = tabla
    .filter(e => e.pedidoId === evento.pedidoId)
    .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha))
    .map(e => {
      const hora = e.fecha.slice(11, 19);
      const quien = `${e.actor.usuario} (${e.actor.rol})`;

      return (
        `${hora} ${e.tipo} | ` +
        `${quien} | origen: ${e.origen}`
      );
    });

  console.log(
    `\n[audit] timeline ${evento.pedidoId}:\n` +
    timeline.map(fila => `   ${fila}`).join('\n')
  );

  console.log(
    `[audit] -> ${AUDIT_TIMELINE}: ` +
    `${registro.pedidoId} ${registro.que}`
  );
}

async function main() {
  iniciarHttp({
    obtenerEventos,
    port,
    origenFrontend,
  });

  await productorTimeline.connect();

  await iniciarConsumidor({
    clientId: 'audit-service',
    groupId: 'audit',
    procesar,
    fromBeginning: true,
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});