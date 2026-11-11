import { randomUUID } from "node:crypto";
import { PublishCommand } from "@aws-sdk/client-sns";

export const TIPOS_KAFKA = {
  CREADO: "PEDIDO_CREADO",
  ACEPTADO: "PEDIDO_ACEPTADO",
  EN_PREPARACION: "PEDIDO_EN_PREPARACION",
  DESPACHADO: "PEDIDO_DESPACHADO",
  ENTREGADO: "PEDIDO_ENTREGADO",
  CANCELADO: "PEDIDO_CANCELADO"
};

export function crearEventoKafka({
  order,
  estado,
  fecha,
  claims,
  roles,
  revision
}) {
  if (!TIPOS_KAFKA[estado]) {
    throw new Error("Estado Kafka no reconocido.");
  }

  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Revisión inválida.");
  }

  if (!Number.isFinite(order.total) || order.total < 0) {
    throw new Error(
      "El pedido no contiene un total histórico válido."
    );
  }

  const rol = roles.includes("admin")
    ? "ADMIN"
    : roles.some(role =>
        ["operador", "operator"].includes(role)
      )
      ? "OPERADOR"
      : "CLIENTE";

  const usuario = claims.oid || claims.sub;

  if (!usuario) {
    throw new Error("Falta la identidad del actor.");
  }

  const texto = value =>
    typeof value === "string" ? value.trim() : "";

  // Nombre obtenido de las claims verificadas del usuario.
  const nombreCompleto = [
    texto(claims.given_name),
    texto(claims.family_name)
  ]
    .filter(Boolean)
    .join(" ");

  const nombre = nombreCompleto || texto(claims.name);

  const items = order.items.map(item => ({
    productoId: item.productId,
    cantidad: item.quantity,
    precio: item.unitPrice
  }));

  if (
    items.some(
      item =>
        !Number.isFinite(item.precio) ||
        item.precio < 0
    )
  ) {
    throw new Error(
      "No se reconstruyen precios antiguos con el catálogo de hoy."
    );
  }

  return {
    version: 2,
    eventId: randomUUID(),
    tipo: TIPOS_KAFKA[estado],
    pedidoId: order.orderId,
    clienteId: order.customerId,
    fecha,
    total: order.total,
    items,
    actor: {
      usuario,
      rol,
      ...(nombre ? { nombre } : {})
    },
    origen: "web",
    revision,
    correlationId: order.orderId
  };
}

export async function publicarEventoKafka(sns, datos) {
  if (
    !process.env.KAFKA_TOPIC_ARN ||
    datos.order.kafkaEnabled !== true
  ) {
    return;
  }

  const evento = crearEventoKafka(datos);

  await sns.send(
    new PublishCommand({
      TopicArn: process.env.KAFKA_TOPIC_ARN,

      ...(process.env.KAFKA_TOPIC_ARN.endsWith(".fifo")
        ? {
            MessageGroupId: datos.order.orderId,
            MessageDeduplicationId: evento.eventId
          }
        : {}),

      Message: JSON.stringify(evento),

      MessageAttributes: {
        tipo_evento: {
          DataType: "String",
          StringValue: evento.tipo
        }
      }
    })
  );
}