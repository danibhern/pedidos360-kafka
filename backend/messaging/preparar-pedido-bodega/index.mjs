import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { config } from "./config.mjs";

const sqs = new SQSClient({});
class ErrorNoRecuperable extends Error {}

async function procesar(msg) {
  if (msg.simularError) {
    throw new Error("Bodega no disponible temporalmente");
  }
  console.log(
    "Orden de preparación en bodega generada para el pedido",
    msg.pedidoId
  );
}

export const handler = async (event) => {
  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body);

      if (!msg.pedidoId) {
        throw new ErrorNoRecuperable("Falta pedidoId");
      }

      await procesar(msg);
    } catch (e) {
      if (e instanceof ErrorNoRecuperable || e instanceof SyntaxError) {
        // No recuperable: se copia directo a la DLQ y se confirma
        // para que no se reintente.
        console.error(
          "No recuperable, va a la DLQ",
          record.messageId,
          e.message
        );
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: config.dlqUrl,
            MessageBody: record.body
          })
        );
      } else {
        // Recuperable: se informa el fallo para que SQS lo reintente.
        console.warn(
          "Recuperable, se reintenta",
          record.messageId,
          e.message
        );
        batchItemFailures.push({
          itemIdentifier: record.messageId
        });
      }
    }
  }

  return { batchItemFailures };
};