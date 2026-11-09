// QA técnica reproducible. NO inicia sesión, NO fabrica JWT y NO prueba autorización real.
// Solo usa recursos locales y el mismo publicador/generador de la carga autenticada.
require('../config.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Kafka,logLevel}=require('kafkajs');
const {DynamoDBClient}=require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient,QueryCommand}=require('@aws-sdk/lib-dynamodb');
const {makeMessage,runId}=require('./carga.cjs');
const {createTransport}=require('../load-transport.cjs');
const argv=process.argv.slice(2);
const option=(name,value)=>{const i=argv.indexOf('--'+name);return i<0?value:argv[i+1];};
const n=Number(option('mensajes',50000)),duplicates=Number(option('duplicados',500));
const route=option('ruta','sns');
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}));
const kafka=new Kafka({clientId:'qa-infra-no-login',logLevel:logLevel.ERROR,
  brokers:process.env.KAFKA_BROKERS.split(',')});
const admin=kafka.admin(),producer=kafka.producer({idempotent:true,maxInFlightRequests:1});
const topic=process.env.PEDIDOS_TOPIC;
const transport=createTransport({route,producer,topic,runId});
const result={fecha:new Date().toISOString(),tipo:'QA de infraestructura, NO login ni HTTP autenticado',
  autenticacionReal:'PENDIENTE con las cuentas del equipo',ruta:route,runId,
  eventosUnicos:n,duplicados:duplicates,publicados:0,estado:'EN_CURSO'};
const offsets=async name=>(await admin.fetchTopicOffsets(name)).reduce((a,p)=>a+BigInt(p.high),0n);
async function count(service){
  let count=0,key;
  do{
    const page=await db.send(new QueryCommand({
      TableName:service==='report'?process.env.REPORT_TABLE:process.env.AUDIT_TABLE,
      KeyConditionExpression:'pk=:p AND begins_with(sk,:e)',
      ExpressionAttributeValues:{':p':service,':e':`EV#${runId}:`},
      Select:'COUNT',ConsistentRead:true,ExclusiveStartKey:key,
    }));
    count+=page.Count||0;key=page.LastEvaluatedKey;
  }while(key);
  return count;
}
async function lag(groupId){
  const group=(await admin.fetchOffsets({groupId,topics:[topic]}))[0];
  const highs=await admin.fetchTopicOffsets(topic);
  return highs.reduce((sum,p)=>{
    const offset=group.partitions.find(x=>x.partition===p.partition)?.offset;
    return sum+Number(BigInt(p.high)-BigInt(offset&&offset!=='-1'?offset:p.low));
  },0);
}
async function main(){
  const start=Date.now();
  try{
    await admin.connect();await producer.connect();
    result.httpSinToken={};
    for(const [name,url] of [['pedidos','http://127.0.0.1:3100/orders'],
      ['report',process.env.REPORT_URL+'/api/report/estados'],
      ['audit',process.env.AUDIT_URL+'/api/audit']]){
      const response=await fetch(url);assert.equal(response.status,401);
      result.httpSinToken[name]=response.status;
    }
    assert.deepEqual(await Promise.all(['report-v2','audit'].map(lag)),[0,0],
      'Esperar lag cero antes de la QA');
    const before=await offsets(topic);
    const timelineBefore=await offsets(process.env.AUDIT_TIMELINE_TOPIC);
    const dltBefore=await Promise.all(['report','audit'].map(s=>offsets(`${topic}.${s}.dlt`)));
    const sending=Date.now();
    for(const [total,isDuplicate] of [[n,false],[duplicates,true]]){
      for(let i=0;i<total;i+=500){
        const messages=Array.from({length:Math.min(500,total-i)},(_,j)=>makeMessage(i+j));
        result.publicados+=await transport.send(messages,{offset:i,duplicates:isDuplicate});
        if(result.publicados%5000===0||isDuplicate)
          console.log(`QA ${route}: publicados ${result.publicados}/${n+duplicates}`);
      }
    }
    result.envioMs=Date.now()-sending;
    const deadline=Date.now()+1200000;
    for(;;){
      const [report,audit,lReport,lAudit,queue]=await Promise.all([
        count('report'),count('audit'),lag('report-v2'),lag('audit'),transport.queue(),
      ]);
      result.consumidores={report,audit};result.lag={report:lReport,audit:lAudit};
      result.sqsAproximado=queue;
      console.log(JSON.stringify({report,audit,lReport,lAudit,queue}));
      if(report===n&&audit===n&&lReport===0&&lAudit===0&&
        await offsets(topic)-before>=BigInt(n+duplicates)) break;
      if(Date.now()>deadline) throw new Error('Timeout de QA');
      await new Promise(resolve=>setTimeout(resolve,5000));
    }
    result.kafkaIncremento=Number(await offsets(topic)-before);
    result.timelineIncremento=Number(await offsets(process.env.AUDIT_TIMELINE_TOPIC)-timelineBefore);
    const after=await Promise.all(['report','audit'].map(s=>offsets(`${topic}.${s}.dlt`)));
    result.dltNuevos=after.map((value,i)=>Number(value-dltBefore[i]));
    assert.equal(result.publicados,n+duplicates);
    assert.ok(result.kafkaIncremento>=n+duplicates);
    assert.ok(result.timelineIncremento>=n+duplicates);
    assert.deepEqual(result.dltNuevos,[0,0]);
    result.estado='APROBADA';
  }catch(error){result.estado='FALLIDA';result.error=error.message;process.exitCode=1;}
  finally{
    result.totalMs=Date.now()-start;
    transport.close();await Promise.allSettled([producer.disconnect(),admin.disconnect()]);
    const dir=path.resolve(__dirname,'../resultados');await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,`qa-infra-${runId}.json`),JSON.stringify(result,null,2));
    console.log('RESULTADO_JSON='+JSON.stringify(result));
  }
}
main();
