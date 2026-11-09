const { transicionValida } = require('../shared/estados');

const procesados = new Set();
const pedidos = new Map();

const ventasPorHora = new Map();
const unidadesPorProducto = new Map();

function aplicar(evento) {
  // El duplicado se verifica antes de revisar la transición.
  if (procesados.has(evento.eventId)) {
    return false;
  }

  const pedidoAnterior = pedidos.get(evento.pedidoId);
  const estadoAnterior = pedidoAnterior?.estado;

  if (!transicionValida(estadoAnterior, evento.tipo)) {
    const error = new Error(
      `transicion invalida ${estadoAnterior ?? '(ninguno)'} -> ${evento.tipo}`
    );

    error.reintentable = false;
    throw error;
  }

  if (evento.tipo === 'PEDIDO_CREADO') {
    const hora = evento.fecha.slice(0, 13);

    pedidos.set(evento.pedidoId, {
      pedidoId: evento.pedidoId,
      estado: evento.tipo,
      creadoEn: evento.fecha,
      entregadoEn: null,
      horaVenta: hora,
      total: evento.total,
    });

    ventasPorHora.set(
      hora,
      (ventasPorHora.get(hora) || 0) + evento.total
    );

    for (const item of evento.items) {
      unidadesPorProducto.set(
        item.productoId,
        (unidadesPorProducto.get(item.productoId) || 0) +
          item.cantidad
      );
    }
  } else {
    if (evento.tipo === 'PEDIDO_CANCELADO') {
      // Revertimos la venta en la hora de creación del pedido.
      const hora = pedidoAnterior.horaVenta;

      ventasPorHora.set(
        hora,
        (ventasPorHora.get(hora) || 0) - pedidoAnterior.total
      );
    }

    if (evento.tipo === 'PEDIDO_ENTREGADO') {
      pedidoAnterior.entregadoEn = evento.fecha;
    }

    pedidoAnterior.estado = evento.tipo;
  }

  // Solo se registra después de aplicar el evento.
  procesados.add(evento.eventId);

  return true;
}

function obtener() {
  const ventas = [...ventasPorHora.entries()]
    .map(([hora, total]) => ({ hora, total }))
    .sort((a, b) => a.hora.localeCompare(b.hora));

  const tiempos = [...pedidos.values()]
    .filter(pedido => pedido.entregadoEn !== null)
    .map(pedido => ({
      pedidoId: pedido.pedidoId,
      segundos:
        (new Date(pedido.entregadoEn) -
          new Date(pedido.creadoEn)) / 1000,
    }))
    .sort((a, b) => a.pedidoId.localeCompare(b.pedidoId));

  const promedioSeg = tiempos.length > 0
    ? tiempos.reduce((suma, pedido) => suma + pedido.segundos, 0) /
      tiempos.length
    : 0;

  const conteoEstados = {
    PEDIDO_CREADO: 0,
    PEDIDO_ACEPTADO: 0,
    PEDIDO_EN_PREPARACION: 0,
    PEDIDO_DESPACHADO: 0,
  };

  for (const pedido of pedidos.values()) {
    if (
      pedido.estado !== 'PEDIDO_ENTREGADO' &&
      pedido.estado !== 'PEDIDO_CANCELADO'
    ) {
      conteoEstados[pedido.estado]++;
    }
  }

  const estados = Object.entries(conteoEstados)
    .map(([estado, cantidad]) => ({ estado, cantidad }));

  const topProductos = [...unidadesPorProducto.entries()]
    .map(([productoId, unidades]) => ({
      productoId,
      unidades,
    }))
    .sort(
      (a, b) =>
        b.unidades - a.unidades ||
        a.productoId.localeCompare(b.productoId)
    )
    .slice(0, 3);

  return {
    ventasPorHora: ventas,
    leadTimePromedioSeg: promedioSeg,
    leadTime: {
      promedioSeg,
      pedidos: tiempos,
    },
    pedidosPorEstado: estados,
    topProductos,
  };
}

module.exports = { aplicar, obtener };