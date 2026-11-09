import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const ORDERS_TABLE = "Pedidos360Orders";

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

  const canSeeAll =
    roles.includes("admin") ||
    roles.includes("operator") ||
    roles.includes("operador");

  const isClient =
    roles.includes("client") ||
    roles.includes("cliente");

  if (!canSeeAll && !isClient) {
    return jsonResponse(403, {
      message:
        "No tienes permiso para consultar pedidos."
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

  if (!canSeeAll && !customerId) {
    return jsonResponse(401, {
      message:
        "El token no contiene una identidad de usuario válida."
    });
  }

  try {
    const items = [];
    let exclusiveStartKey;

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: ORDERS_TABLE,
          Limit: 100,
          ...(exclusiveStartKey
            ? {
                ExclusiveStartKey:
                  exclusiveStartKey
              }
            : {}),
          ...(!canSeeAll
            ? {
                FilterExpression:
                  "customerId = :customerId",
                ExpressionAttributeValues: {
                  ":customerId":
                    customerId
                }
              }
            : {})
        })
      );

      items.push(
        ...(result.Items ?? [])
      );

      exclusiveStartKey =
        result.LastEvaluatedKey;
    } while (exclusiveStartKey);

    items.sort((a, b) =>
      String(b.createdAt).localeCompare(
        String(a.createdAt)
      )
    );

    return jsonResponse(200, {
      items
    });
  } catch (error) {
    console.error(
      "Error listando pedidos:",
      error
    );

    return jsonResponse(500, {
      message:
        "No se pudieron obtener los pedidos."
    });
  }
};