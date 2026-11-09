export const handler = async (event) => {
  for (const record of event.Records) {
    const msg = JSON.parse(record.body);
    console.log("Mensaje recibido. Intento n°", record.attributes.ApproximateReceiveCount, msg);

    if (msg.simularError) {
      throw new Error("Error simulado: este mensaje va a terminar en la DLQ");
    }

    console.log("Boleta generada para el pedido", msg.pedidoId);
  }
};