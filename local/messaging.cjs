// SNS/SQS mediante LocalStack local. Sin credenciales ni servicios de AWS reales.
require('./config.cjs');
const {SNSClient,CreateTopicCommand,SubscribeCommand}=require('@aws-sdk/client-sns');
const {SQSClient,CreateQueueCommand,GetQueueAttributesCommand,SetQueueAttributesCommand,
  ReceiveMessageCommand,DeleteMessageCommand}=require('@aws-sdk/client-sqs');
const {PutCommand}=require('@aws-sdk/lib-dynamodb');
const sns=new SNSClient({endpoint:process.env.AWS_ENDPOINT_URL_SNS});
const sqs=new SQSClient({
  endpoint:process.env.AWS_ENDPOINT_URL_SQS,useQueueUrlAsEndpoint:false,
});
const definitions=[
  {target:'correo',filter:'PedidoCreado'},
  {target:'bodega',filter:'PedidoAceptado'},
  {target:'boleta',filter:'PedidoDespachado'},
  {target:'kafka',fifo:true},
];
async function setupMessaging(){
  const notification=(await sns.send(new CreateTopicCommand({
    Name:'pedidos360-local-notificaciones'}))).TopicArn;
  const analytical=(await sns.send(new CreateTopicCommand({
    Name:'pedidos360-local-eventos.fifo',Attributes:{FifoTopic:'true',ContentBasedDeduplication:'false'},
  }))).TopicArn;
  const queues=[];
  for(const d of definitions){
    const name=`pedidos360-local-${d.target}`, suffix=d.fifo?'.fifo':'';
    const fifo=d.fifo?{FifoQueue:'true',ContentBasedDeduplication:'false'}:{};
    const dlq=await sqs.send(new CreateQueueCommand({
      QueueName:name+'-dlq'+suffix,Attributes:fifo}));
    const dlqArn=(await sqs.send(new GetQueueAttributesCommand({
      QueueUrl:dlq.QueueUrl,AttributeNames:['QueueArn']}))).Attributes.QueueArn;
    const q=await sqs.send(new CreateQueueCommand({
      QueueName:name+suffix,Attributes:{...fifo,VisibilityTimeout:'30',
        RedrivePolicy:JSON.stringify({deadLetterTargetArn:dlqArn,maxReceiveCount:'5'})},
    }));
    const arn=(await sqs.send(new GetQueueAttributesCommand({
      QueueUrl:q.QueueUrl,AttributeNames:['QueueArn']}))).Attributes.QueueArn;
    const topic=d.fifo?analytical:notification;
    await sqs.send(new SetQueueAttributesCommand({QueueUrl:q.QueueUrl,Attributes:{
      Policy:JSON.stringify({Version:'2012-10-17',Statement:[{
        Effect:'Allow',Principal:{Service:'sns.amazonaws.com'},Action:'sqs:SendMessage',
        Resource:arn,Condition:{ArnEquals:{'aws:SourceArn':topic}},
      }]}),
    }}));
    await sns.send(new SubscribeCommand({TopicArn:topic,Protocol:'sqs',Endpoint:arn,
      Attributes:{RawMessageDelivery:'true',
        ...(d.filter?{FilterPolicy:JSON.stringify({tipo_evento:[d.filter]})}:{}),
      },
    }));
    queues.push({...d,url:q.QueueUrl});
  }
  return queues;
}
function startWorkers(queues,{producer,db}){
  for(const q of queues) (async()=>{
    for(;;) {
      try {
        const response=await sqs.send(new ReceiveMessageCommand({
          QueueUrl:q.url,MaxNumberOfMessages:10,WaitTimeSeconds:2,
        }));
        for(const message of response.Messages||[]){
          try {
            const event=JSON.parse(message.Body);
            if(q.target==='kafka') {
              const errors=require('../kafka/shared/dto').validar(event);
              if(errors.length) throw new Error(errors.join('; '));
              await producer.send({topic:process.env.PEDIDOS_TOPIC,acks:-1,messages:[{
                key:event.pedidoId,value:JSON.stringify(event),
                headers:{correlationId:event.correlationId||event.pedidoId},
              }]});
            }else{
              try {
                await db.send(new PutCommand({TableName:'Pedidos360MailboxLocal',Item:{
                  pk:q.target,sk:event.eventId,mensaje:event,creadoEn:new Date().toISOString(),
                  modo:'Trabajo SNS/SQS procesado en LocalStack; no envía correo externo',
                },ConditionExpression:'attribute_not_exists(pk) AND attribute_not_exists(sk)'}));
              }catch(e){if(e.name!=='ConditionalCheckFailedException') throw e;}
            }
            // Confirmar trabajo solamente después del ACK Kafka o de persistir.
            await sqs.send(new DeleteMessageCommand({QueueUrl:q.url,ReceiptHandle:message.ReceiptHandle}));
          }catch(e){console.error(`Trabajo ${q.target} pendiente de reintento: ${e.message}`);break;}
        }
      }catch(e){
        console.error(`SQS ${q.target}: ${e.name}`);
        await new Promise(r=>setTimeout(r,2000));
      }
    }
  })().catch(e=>{console.error('Worker detenido',e.name);process.exit(1);});
}
module.exports={setupMessaging,startWorkers};
