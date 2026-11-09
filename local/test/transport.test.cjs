const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTransport}=require('../load-transport.cjs');
const make=i=>({key:`pedido-${Math.floor(i/5)}`,value:JSON.stringify({eventId:`e-${i}`})});
test('SNS conserva orden por pedido, lotes <=10 y distingue copia lógica de reintento',async()=>{
  const calls=[];
  const snsClient={async send(command){
    const entries=command.input.PublishBatchRequestEntries;
    calls.push(entries);return {Successful:entries.map(e=>({Id:e.Id}))};
  }};
  const t=createTransport({route:'sns',runId:'qa',snsClient,sqsClient:{}});
  const messages=Array.from({length:15},(_,i)=>make(i));
  assert.equal(await t.send(messages),15);
  assert.deepEqual(calls.map(a=>a.length),[10,5]);
  assert.deepEqual(calls.flat().map(e=>JSON.parse(e.Message).eventId),messages.map(m=>JSON.parse(m.value).eventId));
  const first=calls[0][0];
  await t.send([messages[0]]);
  assert.equal(calls[2][0].MessageDeduplicationId,first.MessageDeduplicationId);
  await t.send([messages[0]],{duplicates:true});
  assert.notEqual(calls[3][0].MessageDeduplicationId,first.MessageDeduplicationId);
  assert.equal(calls[3][0].Message,first.Message);
});
test('SNS parcial se rechaza, no se anuncia éxito de todo el lote',async()=>{
  const t=createTransport({route:'sns',runId:'qa',sqsClient:{},snsClient:{
    async send(){return {Successful:[],Failed:[{Id:'e0',Code:'QA'}]};},
  }});
  await assert.rejects(t.send([make(0)]),/no confirmó/);
});
test('La ruta Kafka usa ACK de todas las réplicas y no llama SNS',async()=>{
  let called;
  const t=createTransport({route:'kafka',topic:'qa',runId:'qa',snsClient:{},sqsClient:{},
    producer:{async send(input){called=input;}}});
  assert.equal(await t.send([make(0)]),1);
  assert.equal(called.acks,-1);assert.equal(called.topic,'qa');
  assert.equal(await t.queue(),null);
});
