const { Partitioners } = require('kafkajs');
const { crearKafka } = require('./kafka');
const { validar } = require('./dto');
const { PEDIDOS } = require('./topics');

async function iniciarConsumidor({
  clientId,
  groupId,
  procesar,
  fromBeginning = true,
}) {
  const grupoDlt = groupId === 'report-v2' ? 'report' : groupId;
  const topicoDlt = `${PEDIDOS}.${grupoDlt}.dlt`;

  const kafka = crearKafka(clientId);

  const consumer = kafka.consumer({ groupId });

  const dlt = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
  });

  async function enviarADlt(message, partition, motivo) {
    const texto = Array.isArray(motivo)
      ? motivo.join(', ')
      : String(motivo);

    await dlt.send({
      topic: topicoDlt,
      acks: -1,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: {
            ...message.headers,
            consumidor: groupId,
            fechaError: new Date().toISOString(),
            error: texto.split('\n')[0],
            motivo: texto,
            topicOrigen: PEDIDOS,
            particionOrigen: String(partition),
            offsetOrigen: message.offset,
          },
        },
      ],
    });

    console.error(
      `[${groupId}] -> ${topicoDlt} ` +
      `p${partition} off${message.offset} motivo: ${texto}`
    );
  }

  consumer.on(consumer.events.GROUP_JOIN, ({ payload }) => {
    const asignadas = payload.memberAssignment[PEDIDOS] || [];

    console.log(
      `[${groupId}] particiones asignadas: ` +
      `[${asignadas.join(', ')}]`
    );
  });

  await consumer.connect();
  await dlt.connect();

  await consumer.subscribe({
    topic: PEDIDOS,
    fromBeginning,
  });

  await consumer.run({
    eachMessage: async ({ message, partition }) => {
      let evento;

      try {
        if (message.value === null) {
          throw new Error('mensaje sin valor');
        }

        evento = JSON.parse(message.value.toString());
      } catch (error) {
        return enviarADlt(
          message,
          partition,
          `JSON invalido o mensaje sin valor: ${error.message}`
        );
      }

      const errores = validar(evento);

      if (errores.length > 0) {
        return enviarADlt(message, partition, errores);
      }

      if (process.env.QUIET_MESSAGES !== '1') console.log(
        `[${groupId}] p${partition} off${message.offset} ` +
        `${evento.pedidoId} ${evento.tipo}`
      );

      let ultimoError;

      // Tres intentos totales de procesamiento.
      for (let intento = 1; intento <= 3; intento++) {
        try {
          await procesar(evento);
          return;
        } catch (error) {
          ultimoError = error;

          if (error.reintentable === false) {
            console.error(
              `[${groupId}] error no reintentable: ${error.message}`
            );

            return enviarADlt(
              message,
              partition,
              error.stack || error.message
            );
          }

          console.warn(
            `[${groupId}] intento ${intento}/3 ` +
            `${evento.eventId}: ${error.message}`
          );

          if (intento < 3) {
            const esperaMs = 1000 * 2 ** (intento - 1);

            await new Promise(resolve => {
              setTimeout(resolve, esperaMs);
            });
          }
        }
      }

      return enviarADlt(
        message,
        partition,
        ultimoError.stack || ultimoError.message
      );
    },
  });

  let cerrando = false;

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      if (cerrando) return;

      cerrando = true;

      try {
        await consumer.disconnect();
        await dlt.disconnect();
        process.exit(0);
      } catch (error) {
        console.error(`[${groupId}] error al cerrar:`, error);
        process.exit(1);
      }
    });
  }
}

module.exports = { iniciarConsumidor };
