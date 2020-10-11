const DynamoDB = require('aws-sdk/clients/dynamodb');

const { makeHandler } = require('utils');

const dynamodb = new DynamoDB.DocumentClient();

const inputSchema = {
  type: 'object',
  properties: {
    headers: {
      type: 'object',
      properties: {
        Authorization: { type: 'string' },
      },
      required: ['Authorization'],
    },
  },
  required: ['headers'],
};

const handler = async event => {
  const sessionId = event.headers.Authorization.toLowerCase().replace(
    'bearer',
    ''
  );

  const response = await dynamodb
    .get({
      TableName: process.env.SESSION_STORE_TABLE_NAME,
      Key: {
        SessionId: sessionId,
      },
    })
    .promise();

  if (typeof response.Item === 'undefined') {
    return {
      statusCode: 401,
      body: JSON.stringify({
        username: null,
        error: 'Session does not exist.',
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      username: response.Item.Username,
      error: null,
    }),
  };
};

exports.handler = makeHandler({ handler, inputSchema });
