const crypto = require('crypto');
const { Partitioners } = require('kafkajs');
const { crearKafka } = require('../shared/kafka');
const { crearEvento, validar } = require('../shared/dto');
const { PEDIDOS } = require('../shared/topics');

const producer = crearKafka('bridge').producer({
  idempotent: true,
  maxInFlightRequests: 1,
  createPartitioner: Partitioners.DefaultPartitioner,
});

const CATALOGO = [
  { productoId: 'PROD-1', precio: 8990 },
  { productoId: 'PROD-2', precio: 1990 },
  { productoId: 'PROD-3', precio: 3490 },
];

const FLUJO = [
  'PEDIDO_CREADO',
  'PEDIDO_ACEPTADO',
  'PEDIDO_EN_PREPARACION',
  'PEDIDO_DESPACHADO',
  'PEDIDO_ENTREGADO',
];

function crearPedido(pedidoId, clienteId, variante = 0) {
  const items = [
    { ...CATALOGO[0], cantidad: 1 + (variante % 2) },
    { ...CATALOGO[1], cantidad: 1 },
    { ...CATALOGO[2], cantidad: 1 },
  ];

  return {
    pedidoId,
    clienteId,
    items,
    total: items.reduce(
      (suma, item) => suma + item.cantidad * item.precio,
      0
    ),
    correlationId: crypto.randomUUID(),
  };
}

function datosEvento(pedido, tipo) {
  return {
    tipo,
    pedidoId: pedido.pedidoId,
    clienteId: pedido.clienteId,
    total: pedido.total,
    items: tipo === 'PEDIDO_CREADO' ? pedido.items : undefined,
    actor:
      tipo === 'PEDIDO_CREADO'
        ? {
            usuario: pedido.clienteId,
            rol: 'CLIENTE',
          }
        : {
            usuario: 'op-ana',
            rol: 'OPERADOR',
          },
    origen: 'web',
  };
}

async function publicar(datos, correlationId) {
  const evento = crearEvento(datos);
  const errores = validar(evento);

  if (errores.length > 0) {
    throw new Error(errores.join('; '));
  }

  const [r] = await producer.send({
    topic: PEDIDOS,
    acks: -1,
    messages: [
      {
        key: evento.pedidoId,
        value: JSON.stringify(evento),
        headers: { correlationId },
      },
    ],
  });

  console.log(
    `-> p${r.partition} off${r.baseOffset} ` +
    `${evento.pedidoId} ${evento.tipo}`
  );
}

// Publica sin validar para probar errores o duplicados.
// Permite conservar el mismo correlationId en ambas copias.
async function publicarCrudo(
  key,
  value,
  correlationId = crypto.randomUUID()
) {
  await producer.send({
    topic: PEDIDOS,
    acks: -1,
    messages: [
      {
        key,
        value,
        headers: { correlationId },
      },
    ],
  });

  console.log(`-> (crudo) ${value}`);
}

async function main() {
  const arg = process.argv[2];

  // Sufijo diferente en cada ejecución.
  const ejecucion = crypto.randomUUID();

  await producer.connect();

  try {
    if (arg === '--duplicado') {
      const pedido = crearPedido(
        `P-DUP-${ejecucion}`,
        'C-DUP'
      );

      // Creamos el evento una sola vez.
      const evento = crearEvento(
        datosEvento(pedido, 'PEDIDO_CREADO')
      );

      const valor = JSON.stringify(evento);

      // Publicamos dos copias con el mismo eventId.
      await publicarCrudo(
        evento.pedidoId,
        valor,
        pedido.correlationId
      );

      await publicarCrudo(
        evento.pedidoId,
        valor,
        pedido.correlationId
      );
    } else if (arg === '--salto') {
      // Se conserva P-2001 para la evidencia del ejercicio.
      const pedido = crearPedido('P-2001', 'C-SALTO');

      await publicar(
        datosEvento(pedido, 'PEDIDO_CREADO'),
        pedido.correlationId
      );

      await publicar(
        datosEvento(pedido, 'PEDIDO_DESPACHADO'),
        pedido.correlationId
      );
    } else if (arg === '--total-malo') {
      const pedido = crearPedido(
        `P-TOTAL-MALO-${ejecucion}`,
        'C-9'
      );

      const evento = crearEvento({
        ...datosEvento(pedido, 'PEDIDO_CREADO'),
        total: pedido.total + 1000,
      });

      await publicarCrudo(
        evento.pedidoId,
        JSON.stringify(evento),
        pedido.correlationId
      );
    } else if (arg === '--malo') {
      await publicarCrudo(
        `P-ROTO-${ejecucion}`,
        '{ esto no es JSON'
      );

      const pedido = crearPedido(
        `P-SIN-ID-${ejecucion}`,
        'C-9'
      );

      const evento = crearEvento({
        ...datosEvento(pedido, 'PEDIDO_CREADO'),
        pedidoId: undefined,
      });

      await publicarCrudo(
        'SIN-ID',
        JSON.stringify(evento),
        pedido.correlationId
      );
    } else if (arg === '--falla') {
      const pedido = crearPedido(
        `P-FALLA-${ejecucion}`,
        'C-FALLA'
      );

      await publicar(
        datosEvento(pedido, 'PEDIDO_CREADO'),
        pedido.correlationId
      );
    } else {
      const n = arg === undefined ? 15 : Number(arg);
      const pausa = Number(process.argv[3] ?? 0);

      if (!Number.isInteger(n) || n <= 0) {
        throw new Error(
          'La cantidad de eventos debe ser un entero positivo'
        );
      }

      if (!Number.isFinite(pausa) || pausa < 0) {
        throw new Error(
          'La pausa debe ser un numero mayor o igual que 0'
        );
      }

      // Cada tanda contiene tres pedidos y cinco estados.
      // 15 eventos = tres pedidos completos.
      let emitidos = 0;
      let numeroPedido = 1001;

      while (emitidos < n) {
        const pedidos = Array.from(
          { length: 3 },
          (_, indice) => {
            const numero = numeroPedido++;

            return crearPedido(
              `P-${numero}-${ejecucion}`,
              `C-${numero - 1000}`,
              indice
            );
          }
        );

        for (const tipo of FLUJO) {
          for (const pedido of pedidos) {
            if (emitidos >= n) break;

            await publicar(
              datosEvento(pedido, tipo),
              pedido.correlationId
            );

            emitidos++;

            if (pausa > 0) {
              await new Promise(resolve => {
                setTimeout(resolve, pausa);
              });
            }
          }

          if (emitidos >= n) break;
        }
      }
    }
  } finally {
    await producer.disconnect();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});