const uuidv4 = require('uuid/v4');
const DynamoDB = require('aws-sdk/clients/dynamodb');

const { makeHandler } = require('/opt/utils');

const dynamodb = new DynamoDB.DocumentClient();

const inputSchema = {
  type: 'object',
  properties: {
    body: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['username', 'password'],
    },
  },
};

const EXPIRATION = 7 * 86400000;

const handler = async event => {
  const { username } = event.body;
  const sessionId = uuidv4();
  const createdAt = new Date();
  const expiresAt = new Date(
    createdAt.setTime(createdAt.getDate() + EXPIRATION)
  );

  try {
    await dynamodb
      .put({
        TableName: process.env.SESSION_STORE_TABLE_NAME,
        Item: {
          SessionId: sessionId,
          Username: username,
          CreatedAt: createdAt.toISOString(),
          ExpiresAt: expiresAt.toISOString(),
          TTL: (expiresAt.getTime() / 1000).toString(),
        },
        ConditionExpression: 'attribute_not_exists(SessionId)',
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        sessionId,
        error: null,
      }),
    };
  } catch (error) {
    if (error.code === 'ConditionalCheckFailedException') {
      // This is where you would put error handling logic on a condition expression failure
      console.log('Holy moley -- a UUID collision!');
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        sessionId: null,
        error: 'Could not create session token',
      }),
    };
  }
};

exports.handler = makeHandler({ handler, inputSchema });
