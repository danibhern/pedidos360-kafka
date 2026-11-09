require('./config.cjs');
const express = require('express');
const cors = require('cors');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { Kafka, Partitioners } = require('kafkajs');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { validar } = require('../kafka/shared/dto');
const { guard } = require('./auth.cjs');
const { seed } = require('./seed.cjs');
async function main() {
  let queues;
  for(let attempt=0;;attempt++){
    try{
      await seed();
      queues=await require('./messaging.cjs').setupMessaging();
      break;
    }
    catch(e){if(attempt>=15) throw e;console.warn('Esperando infraestructura local:',e.message);
      await new Promise(r=>setTimeout(r,1000));}
  }
  const producer = new Kafka({clientId:'pedidos360-local-api',
    brokers:process.env.KAFKA_BROKERS.split(',')}).producer({
      idempotent:true,maxInFlightRequests:1,createPartitioner:Partitioners.DefaultPartitioner});
  await producer.connect();
  const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  require('./messaging.cjs').startWorkers(queues,{producer,db});
  const app=express();
  const origins=['http://localhost:5173','http://127.0.0.1:5173'];
  app.use(cors({origin:origins}));
  app.use((req,res,next)=>{
    if(req.headers.origin && !origins.includes(req.headers.origin)) return res.status(403).end();
    next();
  });
  app.get('/healthz', (req,res)=>res.json({ready:true,mode:'local-sin-aws'}));
  app.use(express.json());
  require('./lab-control.cjs').mount(app);
  app.get('/local/mailbox/:target',guard(['admin'],['orders.read']), async(req,res,next)=>{
    try { const out=await db.send(new QueryCommand({TableName:'Pedidos360MailboxLocal',
      KeyConditionExpression:'pk = :p',ExpressionAttributeValues:{':p':req.params.target}}));
      res.json(out.Items || []); } catch(e){next(e);}
  });
  for(const [method,route,name] of [
    ['get','/catalog','catalog-list'],['post','/catalog','catalog-create'],
    ['put','/catalog/:id','catalog-update'],['delete','/catalog/:id','catalog-delete'],
    ['get','/orders','orders-list'],['post','/orders','orders-create'],
    ['put','/orders/:id/status','orders-status-update'],
  ]) {
    const {handler}=await import(pathToFileURL(path.resolve(__dirname,`../backend/src/${name}.mjs`)).href);
    const requiredScope=`${route.startsWith('/catalog')?'catalog':'orders'}.${method==='get'?'read':'write'}`;
    app[method](route,guard(undefined,[requiredScope]),async(req,res,next)=>{
      try {
        const output=await handler({body:JSON.stringify(req.body),pathParameters:req.params,
          requestContext:{authorizer:{jwt:{claims:req.claims}}}});
        res.status(output.statusCode).set(output.headers || {}).send(output.body);
      } catch(e){next(e);}
    });
  }
  app.use((err,req,res,next)=>{console.error(err);res.status(500).json({message:'Error del laboratorio local'});});
  const server=app.listen(3100,process.env.HTTP_HOST,()=>console.log('API local lista en 3100'));
  process.once('SIGTERM',async()=>{server.close();await producer.disconnect();process.exit(0);});
}
main().catch(e=>{console.error(e);process.exit(1);});
