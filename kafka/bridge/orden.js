const { validar } = require('../shared/dto');

function leerMensaje(body) {
  let evento = JSON.parse(body);
  // Acepta SNS→SQS con o sin entrega sin procesar.
  if (evento.Type === 'Notification' && typeof evento.Message === 'string') {
    evento = JSON.parse(evento.Message);
  }
  const errores = validar(evento);
  if (!Number.isInteger(evento.revision) || evento.revision < 0) {
    errores.push('revision requerida: entero >= 0');
  }
  if (evento.revision === 0 && evento.tipo !== 'PEDIDO_CREADO') {
    errores.push('revision 0 debe ser PEDIDO_CREADO');
  }
  if (evento.revision > 0 && evento.tipo === 'PEDIDO_CREADO') {
    errores.push('PEDIDO_CREADO solo puede tener revision 0');
  }
  if (errores.length) throw new Error(errores.join('; '));
  return evento;
}

async function procesarOrdenado({ evento, estado, publicar, guardar }) {
  const previo = estado[evento.pedidoId];
  const ultima = previo?.revision ?? -1;
  if (evento.revision <= ultima) {
    if (evento.revision === ultima && previo.eventId !== evento.eventId) {
      throw new Error('Revisión repetida con otro eventId. Revisar sin borrar mensaje.');
    }
    return true; // Ya publicado y persistido: permite confirmar la copia SQS.
  }
  if (evento.revision !== ultima + 1) {
    console.warn(`[bridge] ${evento.pedidoId}: falta revisión ${ultima + 1}; recibida ${evento.revision}.`);
    return false; // NO borrar SQS; se reentregará.
  }
  await publicar(evento); // Kafka debe confirmar antes de avanzar o borrar SQS.
  const next = { ...estado, [evento.pedidoId]: {
    revision: evento.revision, eventId: evento.eventId
  } };
  await guardar(next);
  estado[evento.pedidoId] = next[evento.pedidoId];
  return true;
}

module.exports = { leerMensaje, procesarOrdenado };
