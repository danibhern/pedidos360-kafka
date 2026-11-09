import {
  DynamoDBClient,
  ScanCommand
} from "@aws-sdk/client-dynamodb";

import { unmarshall } from "@aws-sdk/util-dynamodb";

const client = new DynamoDBClient({});

const TABLE_NAME = "Pedidos360Catalog";

export const handler = async () => {
  try {
    const result = await client.send(
      new ScanCommand({
        TableName: TABLE_NAME
      })
    );

    const items = (result.Items ?? [])
      .map((item) => unmarshall(item))
      .filter((product) => product.active === true)
      .sort((a, b) => a.productId.localeCompare(b.productId));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items
      })
    };
  } catch (error) {
    console.error("Error leyendo Pedidos360Catalog:", error);

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "No se pudo obtener el catálogo"
      })
    };
  }
};