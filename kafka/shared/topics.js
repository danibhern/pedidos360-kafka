// Nombres de los tópicos.
const PEDIDOS = process.env.PEDIDOS_TOPIC || 'pedidos.eventos';

const DLT_REPORT = `${PEDIDOS}.report.dlt`;
const DLT_AUDIT = `${PEDIDOS}.audit.dlt`;

const AUDIT_TIMELINE = process.env.AUDIT_TIMELINE_TOPIC || 'audit.timeline';

// Configuración de los cuatro tópicos.
const TOPICOS = [
  {
    topic: PEDIDOS,
    particiones: 3,
    retencionDias: 7,
    cleanupPolicy: 'delete',
  },
  {
    topic: DLT_REPORT,
    particiones: 3,
    retencionDias: 14,
    cleanupPolicy: 'delete',
  },
  {
    topic: DLT_AUDIT,
    particiones: 3,
    retencionDias: 14,
    cleanupPolicy: 'delete',
  },
  {
    topic: AUDIT_TIMELINE,
    particiones: 3,
    retencionDias: 30,
    cleanupPolicy: 'compact,delete',
  },
];

module.exports = {
  PEDIDOS,
  DLT_REPORT,
  DLT_AUDIT,
  AUDIT_TIMELINE,
  TOPICOS,
};
