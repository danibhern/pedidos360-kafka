// No permitir endpoints reales, aunque existan credenciales AWS en el computador.
const allowed = new Set(['127.0.0.1', 'localhost', 'dynamodb', 'api', 'localstack']);
function localEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !allowed.has(url.hostname)) {
    throw new Error(`Endpoint fuera del laboratorio: ${url.origin}`);
  }
  return value;
}
process.env.AWS_REGION = 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = 'local';
process.env.AWS_SECRET_ACCESS_KEY = 'local';
delete process.env.AWS_SESSION_TOKEN;
process.env.AWS_EC2_METADATA_DISABLED = 'true';
process.env.AWS_ENDPOINT_URL_DYNAMODB = localEndpoint(
  process.env.DYNAMODB_ENDPOINT || 'http://127.0.0.1:18000');
process.env.AWS_ENDPOINT_URL_SNS = localEndpoint(
  process.env.SNS_ENDPOINT || 'http://127.0.0.1:14566');
process.env.AWS_ENDPOINT_URL_SQS = localEndpoint(
  process.env.SQS_ENDPOINT || 'http://127.0.0.1:14566');
process.env.ORDERS_TABLE = 'Pedidos360Orders';
process.env.TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:pedidos360-local-notificaciones';
process.env.KAFKA_TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:pedidos360-local-eventos.fifo';
process.env.REPORT_TABLE = 'Pedidos360ReportLocal';
process.env.AUDIT_TABLE = 'Pedidos360AuditLocal';
process.env.PEDIDOS_TOPIC = 'pedidos360.local.eventos';
process.env.AUDIT_TIMELINE_TOPIC = 'pedidos360.local.audit.timeline';
process.env.HTTP_HOST ||= '127.0.0.1';
module.exports = { localEndpoint };
