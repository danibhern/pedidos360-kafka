const crypto = require('crypto');

const TIPOS = [
  'PEDIDO_CREADO',
  'PEDIDO_ACEPTADO',
  'PEDIDO_EN_PREPARACION',
  'PEDIDO_DESPACHADO',
  'PEDIDO_ENTREGADO',
  'PEDIDO_CANCELADO',
];

const ROLES = ['CLIENTE', 'OPERADOR', 'ADMIN'];

function crearEvento(d) {
  return {
    eventId: d.eventId || crypto.randomUUID(),
    version: d.version ?? 2,
    tipo: d.tipo,
    pedidoId: d.pedidoId,
    clienteId: d.clienteId,
    total: d.total,
    fecha: d.fecha || new Date().toISOString(),
    items: d.items,
    actor: d.actor,
    origen: d.origen,
  };
}

function validar(e) {
  const err = [];

  if (!e || typeof e !== 'object' || Array.isArray(e)) {
    return ['evento debe ser un objeto'];
  }

  if (!e.eventId) err.push('eventId requerido');
  if (e.version !== 2) err.push('version debe ser 2');
  if (!TIPOS.includes(e.tipo)) err.push('tipo invalido');
  if (!e.pedidoId) err.push('pedidoId requerido');

  if (typeof e.total !== 'number' || !Number.isFinite(e.total)) {
    err.push('total debe ser un numero finito');
  }

  if (!e.fecha || !Number.isFinite(Date.parse(e.fecha))) {
    err.push('fecha invalida');
  }

  if (
    typeof e.actor?.usuario !== 'string' ||
    !e.actor.usuario.trim()
  ) {
    err.push('actor.usuario requerido');
  }

  if (!ROLES.includes(e.actor?.rol)) {
    err.push('actor.rol debe ser CLIENTE, OPERADOR o ADMIN');
  }

  if (typeof e.origen !== 'string' || !e.origen.trim()) {
    err.push('origen requerido');
  }

  if (e.tipo === 'PEDIDO_CREADO') {
    if (!Array.isArray(e.items) || e.items.length === 0) {
      err.push('items debe contener al menos un producto');
    } else {
      let suma = 0;
      let itemsValidos = true;

      e.items.forEach((item, indice) => {
        if (!item || typeof item !== 'object') {
          err.push(`items[${indice}] invalido`);
          itemsValidos = false;
          return;
        }

        if (
          typeof item.productoId !== 'string' ||
          !item.productoId.trim()
        ) {
          err.push(`items[${indice}].productoId requerido`);
          itemsValidos = false;
        }

        const cantidadValida =
          typeof item.cantidad === 'number' &&
          Number.isFinite(item.cantidad) &&
          item.cantidad > 0;

        const precioValido =
          typeof item.precio === 'number' &&
          Number.isFinite(item.precio) &&
          item.precio >= 0;

        if (!cantidadValida) {
          err.push(`items[${indice}].cantidad debe ser mayor que 0`);
          itemsValidos = false;
        }

        if (!precioValido) {
          err.push(`items[${indice}].precio invalido`);
          itemsValidos = false;
        }

        if (cantidadValida && precioValido) {
          suma += item.cantidad * item.precio;
        }
      });

      if (itemsValidos && e.total !== suma) {
        err.push(
          `total incorrecto: recibido ${e.total}, esperado ${suma}`
        );
      }
    }
  }

  return err;
}

module.exports = { TIPOS, crearEvento, validar };