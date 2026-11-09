// Mismo publicador usado por la carga del equipo y por la QA de infraestructura.
require('./config.cjs');
const {SNSClient,PublishBatchCommand}=require('@aws-sdk/client-sns');
const {SQSClient,GetQueueUrlCommand,GetQueueAttributesCommand}=require('@aws-sdk/client-sqs');
function createTransport({route,producer,topic,runId,snsClient,sqsClient}) {
  if(!['sns','kafka'].includes(route)) throw new Error('--ruta debe ser sns o kafka');
  const sns=snsClient||new SNSClient({endpoint:process.env.AWS_ENDPOINT_URL_SNS});
  const sqs=sqsClient||new SQSClient({
    endpoint:process.env.AWS_ENDPOINT_URL_SQS,useQueueUrlAsEndpoint:false,
  });
  let queueUrl;
  return {
    async send(messages,{offset=0,duplicates=false}={}) {
      if(route==='kafka') {
        await producer.send({topic,acks:-1,messages});
        return messages.length;
      }
      // Cada lote SNS contiene hasta dos pedidos completos de cinco estados.
      // No se paralelizan llamadas que puedan invertir revisiones de un pedido.
      let accepted=0;
      for(let i=0;i<messages.length;i+=10) {
        const entries=messages.slice(i,i+10).map((m,j)=>({
          Id:`e${j}`,Message:m.value,MessageGroupId:String(m.key),
          // Los duplicados lógicos atraviesan SNS: se deduplican en los consumidores.
          // Un reintento del MISMO envío conserva este ID y es deduplicado por SNS.
          MessageDeduplicationId:`${runId}:${duplicates?'duplicado':'original'}:${offset+i+j}`,
        }));
        const out=await sns.send(new PublishBatchCommand({
          TopicArn:process.env.KAFKA_TOPIC_ARN,PublishBatchRequestEntries:entries,
        }));
        if(out.Failed?.length || out.Successful?.length!==entries.length)
          throw new Error(`SNS no confirmó el lote completo: ${JSON.stringify(out.Failed||[])}`);
        accepted+=out.Successful.length;
      }
      return accepted;
    },
    async queue() {
      if(route==='kafka') return null;
      queueUrl ||= (await sqs.send(new GetQueueUrlCommand({
        QueueName:'pedidos360-local-kafka.fifo',
      }))).QueueUrl;
      const out=await sqs.send(new GetQueueAttributesCommand({
        QueueUrl:queueUrl,AttributeNames:[
          'ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible',
        ],
      }));
      return {
        visiblesAproximados:Number(out.Attributes?.ApproximateNumberOfMessages||0),
        enProcesoAproximados:Number(out.Attributes?.ApproximateNumberOfMessagesNotVisible||0),
      };
    },
    close(){sns.destroy?.();sqs.destroy?.();},
  };
}
module.exports={createTransport};
