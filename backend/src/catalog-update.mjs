import {
  DynamoDBClient,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";

import {
  marshall,
  unmarshall
} from "@aws-sdk/util-dynamodb";

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

  // Acepta el formato observado en API Gateway: "[admin]".
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
      message: "Solo Admin puede actualizar productos."
    });
  }

  // La ruta existente es PUT /catalog/{id}, no {productId}.
  const productId =
    typeof event.pathParameters?.id === "string"
      ? event.pathParameters.id.trim()
      : "";

  if (!productId) {
    return reply(400, {
      message: "Falta el id del producto en la ruta."
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

  const name =
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  const description =
    typeof body.description === "string"
      ? body.description.trim()
      : "";

  if (
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
        "Debes enviar name, description, price y stock válidos."
    });
  }

  try {
    const result = await client.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: marshall({ productId }),
        UpdateExpression:
          "SET #name = :name, #description = :description, #price = :price, #stock = :stock",
        ConditionExpression:
          "attribute_exists(productId)",
        ExpressionAttributeNames: {
          "#name": "name",
          "#description": "description",
          "#price": "price",
          "#stock": "stock"
        },
        ExpressionAttributeValues: marshall({
          ":name": name,
          ":description": description,
          ":price": body.price,
          ":stock": body.stock
        }),
        ReturnValues: "ALL_NEW"
      })
    );

    if (!result.Attributes) {
      throw new Error(
        "DynamoDB no devolvió el producto actualizado."
      );
    }

    return reply(200, {
      message: "Producto actualizado correctamente.",
      product: unmarshall(result.Attributes)
    });
  } catch (error) {
    if (
      error?.name ===
      "ConditionalCheckFailedException"
    ) {
      return reply(404, {
        message: "No existe ese producto."
      });
    }

    console.error(
      "Error actualizando producto:",
      error
    );

    return reply(500, {
      message: "No se pudo actualizar el producto."
    });
  }
};