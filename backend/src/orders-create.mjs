import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { publicarEventoKafka } from "./kafka-event.mjs";


const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const sns = new SNSClient({});


const ORDERS_TABLE = "Pedidos360Orders";
const CATALOG_TABLE = "Pedidos360Catalog";
const MAX_ITEMS = 20;


function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };
}


function getRoles(rawRoles) {
  if (Array.isArray(rawRoles)) {
    return rawRoles
      .filter((role) => typeof role === "string")
      .map((role) => role.trim().toLowerCase());
  }


  if (typeof rawRoles !== "string") {
    return [];
  }


  const value = rawRoles.trim();


  if (!value) {
    return [];
  }


  // API Gateway puede entregar los roles como "[cliente]"
  // o "[operador]", además de un arreglo real.
  if (
    value.startsWith("[") &&
    value.endsWith("]")
  ) {
    const contents = value.slice(1, -1).trim();


    if (!contents) {
      return [];
    }


    return contents
      .split(",")
      .map((role) =>
        role
          .trim()
          .replace(/^["']|["']$/g, "")
          .trim()
          .toLowerCase()
      )
      .filter(Boolean);
  }


  return [value.toLowerCase()];
}


export const handler = async (event) => {
  const claims =
    event.requestContext?.authorizer?.jwt?.claims;


  if (!claims) {
    return jsonResponse(401, {
      message: "Se requiere autenticación."
    });
  }


  const roles = getRoles(claims.roles);


  if (
    !roles.includes("client") &&
    !roles.includes("cliente") &&
    !roles.includes("operator") &&
    !roles.includes("operador")
  ) {
    return jsonResponse(403, {
      message:
        "Solo Cliente u Operador pueden crear pedidos."
    });
  }


  const customerId =
    typeof claims.oid === "string" &&
    claims.oid.trim()
      ? claims.oid.trim()
      : typeof claims.sub === "string" &&
          claims.sub.trim()
        ? claims.sub.trim()
        : "";


  if (!customerId) {
    return jsonResponse(401, {
      message:
        "El token no contiene una identidad de usuario válida."
    });
  }


  let body;


  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return jsonResponse(400, {
      message:
        "El cuerpo de la solicitud debe ser JSON válido."
    });
  }


  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !Array.isArray(body.items)
  ) {
    return jsonResponse(400, {
      message:
        "Debes enviar un objeto con una lista de productos."
    });
  }


  if (
    body.items.length === 0 ||
    body.items.length > MAX_ITEMS
  ) {
    return jsonResponse(400, {
      message:
        `El pedido debe incluir entre 1 y ${MAX_ITEMS} productos.`
    });
  }


  const items = [];
  const seenProductIds = new Set();


  for (const item of body.items) {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item)
    ) {
      return jsonResponse(400, {
        message:
          "Cada producto debe ser un objeto válido."
      });
    }


    const productId =
      typeof item.productId === "string"
        ? item.productId.trim()
        : "";


    const quantity = item.quantity;


    if (
      !productId ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      return jsonResponse(400, {
        message:
          "Cada producto debe tener productId y quantity entero mayor que cero."
      });
    }


    if (seenProductIds.has(productId)) {
      return jsonResponse(400, {
        message:
          `El producto ${productId} está repetido en el pedido.`
      });
    }


    seenProductIds.add(productId);


    items.push({
      productId,
      quantity
    });
  }


  try {
    for (const item of items) {
      const result = await docClient.send(
        new GetCommand({
          TableName: CATALOG_TABLE,
          Key: {
            productId: item.productId
          },
          ConsistentRead: true
        })
      );


      if (
        !result.Item ||
        result.Item.active !== true
      ) {
        return jsonResponse(400, {
          message:
            `El producto ${item.productId} no existe o no está activo.`
        });
      }

      // Precio histórico del servidor; nunca aceptar el precio del navegador.
      if (!Number.isFinite(result.Item.price) || result.Item.price < 0) {
        return jsonResponse(409, { message: `El producto ${item.productId} no tiene precio válido.` });
      }
      item.unitPrice = result.Item.price;
      item.productName = result.Item.name;
    }


    const now = new Date().toISOString();


    const order = {
      orderId: randomUUID(),
      customerId,
      status: "CREADO",
      items,
      total: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
      revision: 0,
      kafkaEnabled: Boolean(process.env.KAFKA_TOPIC_ARN),
      createdAt: now,
      updatedAt: now
    };


    await docClient.send(
      new PutCommand({
        TableName: ORDERS_TABLE,
        Item: order,
        ConditionExpression:
          "attribute_not_exists(orderId)"
      })
    );


    // Publica el evento PedidoCreado en el topic SNS.
    // Si la publicación falla, el pedido ya quedó guardado:
    // la respuesta al cliente no depende de la mensajería.
    try {
      await sns.send(
        new PublishCommand({
          TopicArn: process.env.TOPIC_ARN,
          Message: JSON.stringify({
            type: "PedidoCreado",
            eventId: randomUUID(),
            timestamp: now,
            pedidoId: order.orderId,
            customerId: order.customerId,
            productos: order.items
          }),
          MessageAttributes: {
            tipo_evento: {
              DataType: "String",
              StringValue: "PedidoCreado"
            }
          }
        })
      );
    } catch (eventError) {
      console.error(
        "Pedido guardado, pero no se pudo publicar el evento PedidoCreado:",
        eventError
      );
    }


    // Canal analítico independiente. No reemplaza la publicación SNS anterior.
    try {
      await publicarEventoKafka(sns, {
        order, estado: "CREADO", fecha: now, claims, roles, revision: 0
      });
    } catch (error) {
      console.error("KAFKA_EVENT_PUBLISH_FAILED", {
        pedidoId: order.orderId, revision: 0, mensaje: error.message
      });
    }

    return jsonResponse(201, {
      message:
        "Pedido creado correctamente.",
      order
    });
  } catch (error) {
    console.error(
      "Error creando pedido:",
      error
    );


    return jsonResponse(500, {
      message:
        "No se pudo crear el pedido."
    });
  }
};
