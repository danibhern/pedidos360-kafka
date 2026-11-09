import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({});

export const handler = async (event) => {
  // Funciona con API Gateway (event.body) o con un evento de prueba directo
  const input = typeof event.body === "string" ? JSON.parse(event.body) : event;
  const { pedidoId, tipoEvento, simularError, productos } = input;

  const mensaje = {
    type: tipoEvento,
    eventId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    pedidoId,
    productos: productos ?? [],
    simularError: simularError === true,
  };

  await sns.send(new PublishCommand({
    TopicArn: process.env.TOPIC_ARN,
    Message: JSON.stringify(mensaje),
    MessageAttributes: {
      tipo_evento: { DataType: "String", StringValue: tipoEvento },
    },
  }));

  return { statusCode: 202, body: JSON.stringify({ publicado: mensaje.eventId }) };
};