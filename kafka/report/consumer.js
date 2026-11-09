const { iniciarConsumidor } = require('../shared/consumidor');
const { iniciarHttp } = require('./http');
const kpis = require('./kpis');

const groupId = process.env.GROUP_ID || 'report';

const procesoMs = Number(process.env.PROCESO_MS || 0);
const port = Number(process.env.PORT || 3001);

const origenFrontend =
  process.env.FRONTEND_ORIGIN || 'http://localhost:4200';

if (!Number.isFinite(procesoMs) || procesoMs < 0) {
  throw new Error(
    'PROCESO_MS debe ser un numero mayor o igual que 0'
  );
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    'PORT debe ser un entero entre 1 y 65535'
  );
}

async function procesar(evento) {
  if (evento.clienteId === 'C-FALLA') {
    throw new Error('error simulado en report');
  }

  if (procesoMs > 0) {
    await new Promise(resolve => {
      setTimeout(resolve, procesoMs);
    });
  }

  const aplicado = kpis.aplicar(evento);

  if (!aplicado) {
    console.log(
      `[${groupId}] duplicado ignorado: ${evento.eventId}`
    );
    return;
  }

  console.log(
    `[${groupId}] KPIs:\n` +
    JSON.stringify(kpis.obtener(), null, 2)
  );
}

console.log(
  `[${groupId}] KPIs iniciales en memoria:\n` +
  JSON.stringify(kpis.obtener(), null, 2)
);

// HTTP y Kafka comparten el mismo objeto kpis en este proceso.
iniciarHttp({
  kpis,
  port,
  origenFrontend,
});

iniciarConsumidor({
  clientId: `${groupId}-service`,
  groupId,
  procesar,
  fromBeginning: true,
}).catch(error => {
  console.error(error);
  process.exit(1);
});