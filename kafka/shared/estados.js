const TRANSICIONES = {
  PEDIDO_CREADO: [
    'PEDIDO_ACEPTADO',
    'PEDIDO_CANCELADO',
  ],

  PEDIDO_ACEPTADO: [
    'PEDIDO_EN_PREPARACION',
    'PEDIDO_CANCELADO',
  ],

  PEDIDO_EN_PREPARACION: [
    'PEDIDO_DESPACHADO',
    'PEDIDO_CANCELADO',
  ],

  PEDIDO_DESPACHADO: [
    'PEDIDO_ENTREGADO',
  ],

  PEDIDO_ENTREGADO: [],
  PEDIDO_CANCELADO: [],
};

function transicionValida(anterior, nuevo) {
  if (anterior === undefined || anterior === null) {
    return nuevo === 'PEDIDO_CREADO';
  }

  return TRANSICIONES[anterior]?.includes(nuevo) ?? false;
}

module.exports = { transicionValida };