function definicionTopico({
  topic,
  particiones,
  retencionDias,
  cleanupPolicy = 'delete',
}) {
  return {
    topic,
    numPartitions: particiones,
    replicationFactor: 1,
    configEntries: [
      {
        name: 'cleanup.policy',
        value: cleanupPolicy,
      },
      {
        name: 'retention.ms',
        value: String(retencionDias * 86400000),
      },
    ],
  };
}

module.exports = { definicionTopico };