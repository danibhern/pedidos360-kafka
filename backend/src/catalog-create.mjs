import {
  DynamoDBClient,
  PutItemCommand
} from "@aws-sdk/client-dynamodb";

import { marshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});
const TABLE_NAME = "Pedidos360Catalog";

function reply(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
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

  // API Gateway está entregando el rol como "[admin]".
  // También acepta '["admin"]' y arreglos con varios roles.
  if (value.startsWith("[") && value.endsWith("]")) {
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
    event.requestContext?.authorizer?.jwt?.claims ?? {};

  const roles = getRoles(claims.roles);

  if (!roles.includes("admin")) {
    return reply(403, {
      message: "Solo Admin puede crear productos."
    });
  }

  let body;

  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return reply(400, {
      message: "El cuerpo debe ser JSON válido."
    });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return reply(400, {
      message: "El cuerpo debe ser un objeto JSON."
    });
  }

  const productId =
    typeof body.productId === "string"
      ? body.productId.trim()
      : "";

  const name =
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  const description =
    typeof body.description === "string"
      ? body.description.trim()
      : "";

  if (
    !productId ||
    !name ||
    !description ||
    typeof body.price !== "number" ||
    !Number.isFinite(body.price) ||
    body.price < 0 ||
    typeof body.stock !== "number" ||
    !Number.isInteger(body.stock) ||
    body.stock < 0
  ) {
    return reply(400, {
      message:
        "Debes enviar productId, name, description, price y stock válidos."
    });
  }

  const product = {
    productId,
    name,
    description,
    price: body.price,
    stock: body.stock,
    active: true
  };

  try {
    await client.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: marshall(product),
        ConditionExpression:
          "attribute_not_exists(productId)"
      })
    );

    return reply(201, {
      message: "Producto creado correctamente.",
      product
    });
  } catch (error) {
    if (
      error?.name ===
      "ConditionalCheckFailedException"
    ) {
      return reply(409, {
        message:
          "Ya existe un producto con ese productId."
      });
    }

    console.error(
      "Error creando producto:",
      error
    );

    return reply(500, {
      message:
        "No se pudo crear el producto."
    });
  }
};