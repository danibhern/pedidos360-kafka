export const config = {
  topicArn: process.env.TOPIC_ARN,
  dlqUrl: process.env.DLQ_URL,
  maxReceiveCount: 3
};