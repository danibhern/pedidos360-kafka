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

  // Formato observado desde API Gateway: "[admin]".
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
    event.requestContext?.authorizer?.jwt?.claims ?? {};

  const roles = getRoles(claims.roles);

  if (!roles.includes("admin")) {
    return reply(403, {
      message:
        "Solo Admin puede desactivar productos."
    });
  }

  // La ruta será DELETE /catalog/{id}.
  const productId =
    typeof event.pathParameters?.id === "string"
      ? event.pathParameters.id.trim()
      : "";

  if (!productId) {
    return reply(400, {
      message:
        "Falta el id del producto en la ruta."
    });
  }

  try {
    const result = await client.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: marshall({ productId }),
        UpdateExpression:
          "SET #active = :inactive",
        ConditionExpression:
          "attribute_exists(productId)",
        ExpressionAttributeNames: {
          "#active": "active"
        },
        ExpressionAttributeValues: marshall({
          ":inactive": false
        }),
        ReturnValues: "ALL_NEW"
      })
    );

    if (!result.Attributes) {
      throw new Error(
        "DynamoDB no devolvió el producto."
      );
    }

    return reply(200, {
      message:
        "Producto desactivado correctamente.",
      product: unmarshall(
        result.Attributes
      )
    });
  } catch (error) {
    if (
      error?.name ===
      "ConditionalCheckFailedException"
    ) {
      return reply(404, {
        message:
          "No existe ese producto."
      });
    }

    console.error(
      "Error desactivando producto:",
      error
    );

    return reply(500, {
      message:
        "No se pudo desactivar el producto."
    });
  }
};