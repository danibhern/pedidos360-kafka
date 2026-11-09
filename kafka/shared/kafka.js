const { Kafka, logLevel } = require('kafkajs');

const brokers = (process.env.KAFKA_BROKERS
  || 'localhost:9092').split(',');

function crearKafka(clientId) {
  return new Kafka({
    clientId,                // ej: 'report-service'
    brokers,
    logLevel: logLevel.WARN, // INFO muestra mucho detalle; WARN deja la consola limpia para la demo
    retry: {
      initialRetryTime: 300,
      retries: 8,
    },
  });
}

module.exports = { crearKafka };
// local:  KAFKA_BROKERS=localhost:9092
// EC2:    KAFKA_BROKERS=<ip-privada>:9092
