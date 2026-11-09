// Ejecutar solamente en fase 2, en UN computador y UN proceso.
const fs = require('node:fs/promises');
const path = require('node:path');
const {
  SQSClient, ReceiveMessageCommand, DeleteMessageCommand,
} = require('@aws-sdk/client-sqs');
const { Partitioners } = require('kafkajs');
const { crearKafka } = require('../shared/kafka');
const { PEDIDOS } = require('../shared/topics');
const { leerMensaje, procesarOrdenado } = require('./orden');

async function main() {
  const QueueUrl = process.env.SQS_QUEUE_URL;
  const region = process.env.AWS_REGION;
  if (!QueueUrl || !region || process.env.PEDIDOS_TOPIC !== 'pedidos360.electronica.eventos') throw new Error(
    'Fase 2 desactivada: configura SQS_QUEUE_URL, AWS_REGION y PEDIDOS_TOPIC=pedidos360.electronica.eventos.',
  );
  const dir = path.dirname(path.resolve(
    process.env.BRIDGE_STATE_FILE || '.data/bridge-state.json',
  ));
  const stateFile = path.resolve(process.env.BRIDGE_STATE_FILE || '.data/bridge-state.json');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  // Un lock evita dos puentes en la misma carpeta. No borres un lock de un proceso vivo.
  const lockPath = `${stateFile}.lock`;
  const lock = await fs.open(lockPath, 'wx', 0o600);
  let producer;
  try {
    let estado = Object.create(null);
    try { estado = Object.assign(Object.create(null), JSON.parse(await fs.readFile(stateFile, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const guardar = async next => {
      const temp = `${stateFile}.tmp`;
      const file = await fs.open(temp, 'w', 0o600);
      try { await file.writeFile(JSON.stringify(next)); await file.sync(); }
      finally { await file.close(); }
      await fs.rename(temp, stateFile);
    };
    const sqs = new SQSClient({ region }); // Cadena de credenciales AWS local. No claves en código.
    producer = crearKafka('pedidos360-sqs-local').producer({
      idempotent: true, maxInFlightRequests: 1,
      createPartitioner: Partitioners.DefaultPartitioner,
    });
    await producer.connect();
    const publicar = async evento => {
      await producer.send({
        topic: PEDIDOS, acks: -1,
        messages: [{ key: evento.pedidoId, value: JSON.stringify(evento), headers: {
          eventId: evento.eventId,
          correlationId: evento.correlationId || evento.pedidoId,
        } }],
      });
      console.log(`[bridge] Kafka confirmó ${evento.pedidoId} r${evento.revision} ${evento.tipo}`);
    };
    let detener = false;
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => { detener = true; });
    }
    console.log('[bridge] activo. UN puente; no ejecutar producer durante pedidos reales.');
    while (!detener) {
      const response = await sqs.send(new ReceiveMessageCommand({
        QueueUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: 20, VisibilityTimeout: 30,
      }));
      for (const message of response.Messages || []) {
        try {
          const evento = leerMensaje(message.Body);
          const confirmar = await procesarOrdenado({ evento, estado, publicar, guardar });
          if (confirmar) {
            await sqs.send(new DeleteMessageCommand({
              QueueUrl, ReceiptHandle: message.ReceiptHandle,
            }));
          }
        } catch (error) {
          console.error(`[bridge] SQS conserva ${message.MessageId}: ${error.message}`);
        }
      }
    }
    sqs.destroy();
  } finally {
    await producer?.disconnect();
    await lock.close();
    await fs.unlink(lockPath);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
