require('./config.cjs');

const { crearJournal } = require('./journal.cjs');
const { iniciarConsumidor } = require('../kafka/shared/consumidor');
const { guard } = require('./auth.cjs');
const { Kafka, Partitioners, logLevel } = require('kafkajs');

const service = process.env.SERVICE;

if (!['report', 'audit'].includes(service)) {
  throw new Error('SERVICE debe ser report o audit');
}

const journal = crearJournal(service);
const kpis = require('../kafka/report/kpis');

const eventos = [];
const vistos = new Set();
const runs = new Map();

let ready = false;

function apply(e) {
  if (vistos.has(e.eventId)) {
    return;
  }

  if (service === 'report') {
    kpis.aplicar(e);
  } else {
    eventos.push(e);
  }

  vistos.add(e.eventId);

  const id = e.runId || 'interactivo';

  const r = runs.get(id) || {
    unicos: 0,
    pedidos: 0,
    ventas: 0,
    entregados: 0
  };

  r.unicos++;

  if (e.tipo === 'PEDIDO_CREADO') {
    r.pedidos++;
    r.ventas += e.total;
  }

  if (e.tipo === 'PEDIDO_CANCELADO') {
    r.ventas -= e.total;
  }

  if (e.tipo === 'PEDIDO_ENTREGADO') {
    r.entregados++;
  }

  runs.set(id, r);
}

async function main() {
  for (const e of await journal.cargar()) {
    apply(e);
  }

  let timeline;

  if (service === 'audit') {
    timeline = new Kafka({
      clientId: 'local-audit-timeline',
      brokers: process.env.KAFKA_BROKERS.split(','),
      logLevel: logLevel.WARN
    }).producer({
      idempotent: true,
      maxInFlightRequests: 1,
      createPartitioner: Partitioners.DefaultPartitioner
    });

    await timeline.connect();
  }

  const authorize = guard(['admin'], ['orders.read']);

  const autorizar = (req, res, next) => {
    if (req.path === '/healthz') {
      return res.status(ready ? 200 : 503).json({
        ready,
        service
      });
    }

    authorize(req, res, () => {
      if (req.path === '/local/metrics') {
        return res.json({
          ready,
          service,
          totalUnicos: vistasSize(),
          run: runs.get(req.query.runId) || {
            unicos: 0,
            pedidos: 0,
            ventas: 0,
            entregados: 0
          }
        });
      }

      next();
    });
  };

  const common = {
    port: Number(
      process.env.PORT || (service === 'report' ? 3001 : 3002)
    ),
    origenFrontend: [
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ],
    autorizar
  };

  if (service === 'report') {
    require('../kafka/report/http').iniciarHttp({
      ...common,
      kpis
    });
  } else {
    require('../kafka/audit/http').iniciarHttp({
      ...common,
      obtenerEventos: () => eventos
    });
  }

  await iniciarConsumidor({
    clientId: `local-${service}`,
    groupId: service === 'report' ? 'report-v2' : 'audit',

    procesar: async e => {
      if (service === 'report' && vistos.has(e.eventId)) {
        return;
      }

      // Validar transición antes de guardar un evento
      // que impediría restaurar.
      if (service === 'report') {
        kpis.aplicar(e);
      }

      try {
        await journal.guardar(e);
      } catch (error) {
        console.error(
          'Persistencia fallida; salir SIN confirmar offset',
          error
        );

        process.exit(1);
      }

      if (timeline) {
        const nombre =
          typeof e.actor.nombre === 'string'
            ? e.actor.nombre.trim()
            : '';

        const quien = [
          nombre,
          `${e.actor.usuario} (${e.actor.rol})`
        ]
          .filter(Boolean)
          .join(' — ');

        await timeline.send({
          topic: process.env.AUDIT_TIMELINE_TOPIC,
          acks: -1,

          messages: [
            {
              key: `${e.pedidoId}:${e.eventId}`,

              value: JSON.stringify({
                pedidoId: e.pedidoId,
                eventId: e.eventId,
                runId: e.runId || 'interactivo',
                quien,
                que: e.tipo,
                cuando: e.fecha,
                desdeDonde: e.origen
              })
            }
          ]
        });
      }

      apply(e);

      // Snapshot compacto: el journal completo permite
      // reconstruir tras reiniciar.
      if (vistos.size % 100 === 0) {
        await journal.snapshot({
          totalUnicos: vistasSize(),

          ...(service === 'report'
            ? {
                ventasPorHora: kpis.obtener().ventasPorHora,
                topProductos: kpis.obtener().topProductos,
                pedidosPorEstado: kpis.obtener().pedidosPorEstado,
                leadTimePromedioSeg:
                  kpis.obtener().leadTimePromedioSeg
              }
            : {})
        });
      }
    }
  });

  ready = true;
}

function vistasSize() {
  return vistos.size;
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});