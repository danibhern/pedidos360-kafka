require('./config.cjs');
const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { Kafka } = require('kafkajs');
const db = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(db);
async function seed() {
  for (const [TableName, keys] of [
    ['Pedidos360Catalog', ['productId']], ['Pedidos360Orders', ['orderId']],
    ['Pedidos360ReportLocal', ['pk','sk']], ['Pedidos360AuditLocal', ['pk','sk']],
    ['Pedidos360MailboxLocal', ['pk','sk']],
  ]) {
    try {
      await db.send(new CreateTableCommand({ TableName, BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: keys.map(AttributeName => ({ AttributeName, AttributeType: 'S' })),
        KeySchema: keys.map((AttributeName, i) => ({ AttributeName, KeyType: i ? 'RANGE' : 'HASH' })),
      }));
    } catch (e) { if (e.name !== 'ResourceInUseException') throw e; }
    for (let n=0; n<60; n++) {
      const x = await db.send(new DescribeTableCommand({TableName}));
      if (x.Table?.TableStatus === 'ACTIVE') break;
      if (n===59) throw new Error('Tabla no activa');
      await new Promise(r => setTimeout(r,500));
    }
  }
  for (const item of [
    { productId: 'ELEC-USB', name: 'Hub USB-C', price: 19990, stock: 10000 },
    { productId: 'ELEC-TECLADO', name: 'Teclado mecánico', price: 45990, stock: 10000 },
    { productId: 'ELEC-SSD', name: 'SSD 1 TB', price: 79990, stock: 10000 },
  ]) {
    try {
      await doc.send(new PutCommand({ TableName:'Pedidos360Catalog',
        Item: {...item,description:'Producto electrónico de prueba local',active:true},
        ConditionExpression: 'attribute_not_exists(productId)' }));
    } catch(e) { if(e.name!=='ConditionalCheckFailedException') throw e; }
  }
  const kafka = new Kafka({ clientId: 'local-init',
    brokers:(process.env.KAFKA_BROKERS || '127.0.0.1:19093').split(',') });
  const admin = kafka.admin();
  const {TOPICOS}=require('../kafka/shared/topics');
  await admin.connect();
  try {
    const existing=new Set(await admin.listTopics());
    const configs=t=>[
      {name:'retention.ms',value:String(t.retencionDias*86400000)},
      {name:'cleanup.policy',value:t.cleanupPolicy},
    ];
    await admin.createTopics({waitForLeaders:true,topics:TOPICOS
      .filter(t=>!existing.has(t.topic)).map(t=>({
        topic:t.topic,numPartitions:t.particiones,replicationFactor:2,configEntries:configs(t),
      }))});
    // Alinea también configuraciones previas sin borrar mensajes ni volúmenes.
    await admin.alterConfigs({resources:TOPICOS.map(t=>({
      type:2,name:t.topic,configEntries:configs(t),
    }))});
  } finally { await admin.disconnect(); }
  console.log('Inicialización local terminada; no se sobrescribieron productos existentes');
}
module.exports = { seed };
if (require.main===module) seed().catch(e=>{ console.error(e);process.exitCode=1; });
