export const handler = async (event) => {
  for (const record of event.Records) {
    const msg = JSON.parse(record.body);
    console.log("Mensaje recibido. Intento n°", record.attributes.ApproximateReceiveCount, msg);

    console.log(`Correo enviado al cliente: evento ${msg.type} del pedido`, msg.pedidoId);
  }
};