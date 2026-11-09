// MVP académico: un consumidor por servicio; journal durable, cache restaurada.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand,
} = require('@aws-sdk/lib-dynamodb');
function crearJournal(servicio, cliente) {
  const TableName = servicio === 'report'
    ? process.env.REPORT_TABLE : process.env.AUDIT_TABLE;
  if (!TableName) throw new Error(`Falta tabla DynamoDB de ${servicio}`);
  const db = cliente || DynamoDBDocumentClient.from(
    new DynamoDBClient({ region: process.env.AWS_REGION }),
  );
  const pk = servicio;
  return {
    async cargar() {
      const eventos = [];
      let ExclusiveStartKey;
      do {
        const page = await db.send(new QueryCommand({
          TableName, KeyConditionExpression: 'pk = :pk AND begins_with(sk, :ev)',
          ExpressionAttributeValues: { ':pk': pk, ':ev': 'EV#' },
          ConsistentRead: true, ExclusiveStartKey,
        }));
        eventos.push(...(page.Items || []).map(item => item.evento));
        ExclusiveStartKey = page.LastEvaluatedKey;
      } while (ExclusiveStartKey);
      // Los pedidos no dependen entre sí. Cada pedido se restaura por revisión.
      return eventos.sort((a, b) =>
        a.pedidoId.localeCompare(b.pedidoId) || a.revision - b.revision);
    },
    async guardar(evento) {
      const sk = `EV#${evento.eventId}`;
      try {
        await db.send(new PutCommand({
          TableName, Item: { pk, sk, evento },
          ConditionExpression: 'attribute_not_exists(pk)',
        }));
      } catch (error) {
        if (error.name !== 'ConditionalCheckFailedException') throw error;
        const actual = await db.send(new GetCommand({
          TableName, Key: { pk, sk }, ConsistentRead: true,
        }));
        if (JSON.stringify(actual.Item?.evento) !== JSON.stringify(evento)) {
          // Comparación semántica, independiente del orden de propiedades DynamoDB.
          const { isDeepStrictEqual } = require('node:util');
          if (!isDeepStrictEqual(actual.Item?.evento, evento)) {
            throw new Error(`Colisión de eventId ${evento.eventId}`);
          }
        }
      }
    },
    async snapshot(kpis) {
      await db.send(new PutCommand({
        TableName, Item: {
          pk, sk: 'SNAPSHOT', kpis, actualizadoEn: new Date().toISOString(),
        },
      }));
    },
  };
}
module.exports = { crearJournal };
