require('../config.cjs');
const { Kafka, Partitioners, logLevel } = require('kafkajs');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const fs = require('node:fs/promises');
const path = require('node:path');
const { validar } = require('../../kafka/shared/dto');

const argv = process.argv.slice(2);

function option(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i < 0 ? fallback : argv[i + 1];
}

const n = Number(option('mensajes', 5000));
const batchSize = Number(option('lote', 500));
const timeout = Number(option('timeout', 1200));
const duplicateCount = Number(option('duplicados', 0));
const route = option('ruta', 'sns');

if (
  !Number.isSafeInteger(n) || n < 5 || n > 1000000 || n % 5 ||
  !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5000 ||
  !Number.isFinite(timeout) || timeout < 1 ||
  !Number.isSafeInteger(duplicateCount) ||
  duplicateCount < 0 || duplicateCount > n ||
  !['sns', 'kafka'].includes(route) ||
  (route === 'sns' && batchSize % 5 !== 0)
) {
  throw new Error(
    '--mensajes múltiplo de 5; --lote 1..5000 (múltiplo de 5 para SNS); ' +
    '--ruta sns|kafka; --duplicados 0..mensajes; --timeout > 0'
  );
}

const runId = `carga-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
const topic = process.env.PEDIDOS_TOPIC;

const kafka = new Kafka({
  clientId: 'pedidos360-prueba-carga',
  brokers: (
    process.env.KAFKA_BROKERS ||
    '127.0.0.1:19093,127.0.0.1:19094'
  ).split(','),
  logLevel: logLevel.ERROR
});

const producer = kafka.producer({
  idempotent: true,
  maxInFlightRequests: 1,
  createPartitioner: Partitioners.DefaultPartitioner
});

const admin = kafka.admin();

const transport = require('../load-transport.cjs').createTransport({
  route,
  producer,
  topic,
  runId
});

const types = [
  'PEDIDO_CREADO',
  'PEDIDO_ACEPTADO',
  'PEDIDO_EN_PREPARACION',
  'PEDIDO_DESPACHADO',
  'PEDIDO_ENTREGADO'
];

const products = [
  ['ELEC-USB', 19990],
  ['ELEC-TECLADO', 45990],
  ['ELEC-SSD', 79990]
];

const base = Date.now() - 60000;

function makeEvent(index) {
  const order = Math.floor(index / 5);
  const revision = index % 5;
  const [productoId, precio] = products[order % 3];
  const cantidad = order % 3 + 1;

  return {
    eventId: `${runId}:${index}`,
    version: 2,
    runId,
    revision,
    correlationId: `${runId}-P${order}`,
    pedidoId: `${runId}-P${order}`,
    clienteId: `cliente-sintetico-${order % 20}`,
    tipo: types[revision],
    fecha: new Date(base + revision * 1000).toISOString(),
    total: precio * cantidad,
    items: [{ productoId, cantidad, precio }],
    actor: {
      usuario: revision ? 'operador-carga' : 'cliente-carga',
      rol: revision ? 'OPERADOR' : 'CLIENTE'
    },
    origen: 'script-carga-local'
  };
}

function makeMessage(i) {
  const e = makeEvent(i);
  const errors = validar(e);

  if (errors.length) {
    throw new Error(errors.join('; '));
  }

  return {
    key: e.pedidoId,
    value: JSON.stringify(e),
    headers: {
      correlationId: e.correlationId
    }
  };
}

const summary = {
  runId,
  inicio: new Date().toISOString(),
  ruta: route,
  alcance: route === 'sns'
    ? 'SNS local > SQS FIFO > puente > Kafka > report/audit. No crea pedidos en Orders.'
    : 'Kafka directo > report/audit. Omite SNS/SQS; no mide HTTP ni crea pedidos en Orders.',
  solicitado: n,
  duplicadosSolicitados: duplicateCount,
  pedidosSinteticos: n / 5,
  confirmadosPublicacion: 0,
  confirmadosSNS: 0,
  confirmadosKafka: 0,
  estado: 'EN_CURSO',
  latencia: 'ACK de publicación por lote, no latencia individual ni entrega física'
};

async function session() {
  return require('./real-tokens.cjs').token('admin');
}

async function metrics(port, token) {
  const host = port === 3001
    ? (process.env.REPORT_URL || 'http://127.0.0.1:3001')
    : (process.env.AUDIT_URL || 'http://127.0.0.1:3002');

  const r = await fetch(
    `${host}/local/metrics?runId=${encodeURIComponent(runId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(5000)
    }
  );

  if (!r.ok) {
    throw new Error(`Métricas ${port} HTTP ${r.status}`);
  }

  return r.json();
}

async function reportGet(route, token) {
  const host = process.env.REPORT_URL || 'http://127.0.0.1:3001';

  const r = await fetch(`${host}/api/report/${route}`, {
    headers: {
      Authorization: `Bearer ${token}`
    },
    signal: AbortSignal.timeout(10000)
  });

  if (!r.ok) {
    throw new Error(`Reporte ${route}: HTTP ${r.status}`);
  }

  return r.json();
}

async function offsetSum(t) {
  return (await admin.fetchTopicOffsets(t))
    .reduce((s, p) => s + BigInt(p.high), 0n);
}

async function lag(groupId) {
  const group = (
    await admin.fetchOffsets({
      groupId,
      topics: [topic]
    })
  )[0];

  const highs = await admin.fetchTopicOffsets(topic);

  return highs.reduce((s, p) => {
    const c = group?.partitions.find(
      x => x.partition === p.partition
    )?.offset;

    return s + BigInt(p.high) -
      (c && c !== '-1' ? BigInt(c) : BigInt(p.low));
  }, 0n);
}

const pause = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const start = performance.now();
  const latencies = [];

  const dir = path.resolve(__dirname, '../resultados');
  await fs.mkdir(dir, { recursive: true });

  const flowFile = path.join(dir, `${runId}-flujo.jsonl`);

  let timer;
  let sampling = false;
  let pending = Promise.resolve();
  let lastSample;
  let token;
  let offsetBefore;

  async function sample(stage) {
    if (sampling) return;

    sampling = true;

    try {
      const [report, audit, lReport, lAudit, queue, offset] =
        await Promise.all([
          metrics(3001, token),
          metrics(3002, token),
          lag('report-v2'),
          lag('audit'),
          transport.queue(),
          offsetSum(topic)
        ]);

      summary.report = report.run;
      summary.audit = audit.run;
      summary.lag = {
        report: String(lReport),
        audit: String(lAudit)
      };

      if (route === 'sns') {
        summary.confirmadosKafka = Number(offset - offsetBefore);
      }

      lastSample = {
        fecha: new Date().toISOString(),
        runId,
        etapa: stage,
        ruta: route,
        publicacion: summary.confirmadosPublicacion,
        sns: summary.confirmadosSNS,
        kafka: summary.confirmadosKafka,
        report: report.run.unicos,
        audit: audit.run.unicos,
        objetivo: n,
        lag: summary.lag,
        sqs: queue
      };

      await fs.appendFile(
        flowFile,
        JSON.stringify(lastSample) + '\n'
      );

      console.log(
        `[${stage}] publicados=${lastSample.publicacion} SNS=${lastSample.sns} ` +
        `Kafka=${lastSample.kafka} report=${lastSample.report}/${n} audit=${lastSample.audit}/${n} ` +
        `lag=${lReport}/${lAudit}` +
        (queue
          ? ` SQS~=${queue.visiblesAproximados}+${queue.enProcesoAproximados}`
          : '')
      );
    } finally {
      sampling = false;
    }
  }

  let expectedSales = 0;

  for (let i = 0; i < n; i += 5) {
    expectedSales += makeEvent(i).total;
  }

  summary.esperado = {
    unicos: n,
    pedidos: n / 5,
    ventas: expectedSales,
    entregados: n / 5
  };

  try {
    token = await session();

    await admin.connect();
    await producer.connect();

    const before = await Promise.all(
      ['report', 'audit'].map(async s =>
        String(await offsetSum(`${topic}.${s}.dlt`))
      )
    );

    const salesBefore = (
      await reportGet('ventas-por-hora', token)
    ).reduce((s, x) => s + x.total, 0);

    const timelineBefore = await offsetSum(
      process.env.AUDIT_TIMELINE_TOPIC
    );

    offsetBefore = await offsetSum(topic);

    for (const port of [3001, 3002]) {
      if (!(await metrics(port, token)).ready) {
        throw new Error(`Consumidor ${port} no listo`);
      }
    }

    await sample('INICIO');

    if (
      summary.lag.report !== '0' ||
      summary.lag.audit !== '0'
    ) {
      throw new Error(
        'Espera a que el lag anterior llegue a cero antes de iniciar otra carga'
      );
    }

    timer = setInterval(() => {
      if (!sampling) {
        pending = sample('FLUJO').catch(e =>
          console.warn(`Observación temporal: ${e.message}`)
        );
      }
    }, 3000);

    const sending = performance.now();

    for (const [count, duplicates] of [
      [n, false],
      [duplicateCount, true]
    ]) {
      for (
        let begin = 0;
        begin < count;
        begin += batchSize
      ) {
        const messages = Array.from(
          {
            length: Math.min(batchSize, count - begin)
          },
          (_, j) => makeMessage(begin + j)
        );

        const t = performance.now();

        const accepted = await transport.send(messages, {
          offset: begin,
          duplicates
        });

        latencies.push(performance.now() - t);
        summary.confirmadosPublicacion += accepted;

        if (route === 'sns') {
          summary.confirmadosSNS += accepted;
        } else {
          summary.confirmadosKafka += accepted;
        }

        console.log(
          `PUBLICACION ${route.toUpperCase()} ` +
          `${summary.confirmadosPublicacion}/${n + duplicateCount}`
        );
      }
    }

    summary.envioMs = performance.now() - sending;
    summary.mensajesPorSegundo =
      summary.confirmadosPublicacion /
      (summary.envioMs / 1000);

    const deadline = Date.now() + timeout * 1000;
    let lastNotice = 0;

    while (true) {
      const [report, audit, lReport, lAudit, kafkaNow] =
        await Promise.all([
          metrics(3001, token),
          metrics(3002, token),
          lag('report-v2'),
          lag('audit'),
          offsetSum(topic)
        ]);

      summary.report = report.run;
      summary.audit = audit.run;
      summary.lag = {
        report: String(lReport),
        audit: String(lAudit)
      };

      const equal = r =>
        Object.entries(summary.esperado).every(
          ([k, v]) => r[k] === v
        );

      if (
        equal(report.run) &&
        equal(audit.run) &&
        lReport === 0n &&
        lAudit === 0n &&
        kafkaNow - offsetBefore >= BigInt(n + duplicateCount)
      ) {
        break;
      }

      if (Date.now() > deadline) {
        throw new Error(
          'Timeout: falta consumo, hay lag o las métricas no coinciden'
        );
      }

      if (Date.now() - lastNotice > 5000) {
        console.log(
          `Kafka ACK ${summary.confirmadosKafka}; ` +
          `report ${report.run.unicos}/${n}; ` +
          `audit ${audit.run.unicos}/${n}`
        );

        lastNotice = Date.now();
      }

      await pause(500);
    }

    const after = await Promise.all(
      ['report', 'audit'].map(s =>
        offsetSum(`${topic}.${s}.dlt`)
      )
    );

    summary.dltNuevos = {
      report: String(after[0] - BigInt(before[0])),
      audit: String(after[1] - BigInt(before[1]))
    };

    if (after.some((v, i) => v !== BigInt(before[i]))) {
      throw new Error('Se detectaron mensajes nuevos en DLT');
    }

    const salesAfter = (
      await reportGet('ventas-por-hora', token)
    ).reduce((s, x) => s + x.total, 0);

    const lead = await reportGet('lead-time', token);

    const own = lead.pedidos.filter(p =>
      p.pedidoId.startsWith(`${runId}-P`)
    );

    summary.kpisReales = {
      incrementoVentas: salesAfter - salesBefore,
      pedidosEntregados: own.length,
      leadTimeSinteticoCorrecto: own.every(
        p => p.segundos === 4
      )
    };

    if (
      summary.kpisReales.incrementoVentas !== expectedSales ||
      own.length !== n / 5 ||
      !summary.kpisReales.leadTimeSinteticoCorrecto
    ) {
      throw new Error(
        'Los KPI HTTP reales no coinciden con la carga'
      );
    }

    summary.auditTimelineNuevos = String(
      await offsetSum(process.env.AUDIT_TIMELINE_TOPIC) -
      timelineBefore
    );

    if (
      BigInt(summary.auditTimelineNuevos) <
      BigInt(n + duplicateCount)
    ) {
      throw new Error('Faltan publicaciones en audit.timeline');
    }

    clearInterval(timer);
    await pending;

    await sample('FINAL');

    if (summary.confirmadosKafka < n + duplicateCount) {
      throw new Error('Faltan registros confirmados en Kafka');
    }

    summary.sqsFinal = lastSample.sqs;
    summary.archivoFlujo = path.basename(flowFile);
    summary.estado = 'APROBADA';

    latencies.sort((a, b) => a - b);

    const p = x =>
      latencies[
        Math.max(0, Math.ceil(latencies.length * x) - 1)
      ];

    summary.ackLotesMs = {
      p50: p(.5),
      p95: p(.95),
      p99: p(.99)
    };
  } catch (e) {
    summary.estado = 'FALLIDA';
    summary.error = e.message;
    process.exitCode = 1;
  } finally {
    clearInterval(timer);
    await pending;

    summary.totalMs = performance.now() - start;
    summary.fin = new Date().toISOString();

    await Promise.allSettled([
      producer.disconnect(),
      admin.disconnect()
    ]);

    transport.close();

    const file = path.join(dir, `${runId}.json`);

    await fs.writeFile(
      file,
      JSON.stringify(summary, null, 2)
    );

    await fs.writeFile(
      path.join(dir, `${runId}.csv`),
      'runId,estado,solicitado,duplicados,confirmadosKafka,reportUnicos,auditUnicos,envioMs,totalMs,mensajesPorSegundo,ruta,confirmadosSNS\n' +
      [
        runId,
        summary.estado,
        n,
        duplicateCount,
        summary.confirmadosKafka,
        summary.report?.unicos ?? '',
        summary.audit?.unicos ?? '',
        summary.envioMs ?? '',
        summary.totalMs,
        summary.mensajesPorSegundo ?? '',
        route,
        summary.confirmadosSNS
      ].join(',') + '\n'
    );

    console.log(JSON.stringify(summary, null, 2));
    console.log(`Evidencia: ${file}`);
  }
}

if (require.main === module) main();

module.exports = {
  makeEvent,
  makeMessage,
  runId
};