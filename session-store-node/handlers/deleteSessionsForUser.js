const DynamoDB = require('aws-sdk/clients/dynamodb');

const { makeHandler } = require('./utils');

const dynamodb = new DynamoDB.DocumentClient();

const inputSchema = {
  type: 'object',
  properties: {
    pathParameters: {
      type: 'object',
      properties: {
        username: { type: 'string' },
      },
      required: ['username'],
    },
    headers: {
      type: 'object',
      properties: {
        Authorization: { type: 'string' },
      },
      required: ['Authorization'],
    },
  },
  required: ['pathParameters', 'headers'],
};

const handler = async event => {
  const sessionId = event.headers.Authorization.toLowerCase().replace(
    'bearer ',
    ''
  );

  const response = await dynamodb
    .getItem({
      TableName: process.env.TABLE_NAME,
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

  const username = response.Item.Username;

  // User is trying to delete someone else's tokens
  if (username !== event.pathParameters.username) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        username: null,
        error: 'Invalid session.',
      }),
    };
  }

  let response;

  try {
    response = await dynamodb
      .query({
        TableName: process.env.TABLE_NAME,
        IndexName: process.env.INDEX_NAME,
        KeyConditionExpression: '#username = :username',
        ExpressionAttributeNames: {
          '#username': 'Username',
        },
        ExpressionAttributeValues: {
          ':username': username,
        },
      })
      .promise();
  } catch (error) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        username: null,
        error: 'Could not find sessions.',
      }),
    };
  }

  const deletes = response.Items.map(item => {
    return {
      DeleteRequest: {
        Key: {
          SessionId: item.SessionId,
        },
      },
    };
  });

  try {
    await dynamodb.batchWriteItem({
      RequestItems: {
        [process.env.TABLE_NAME]: deletes,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        username,
        error: null,
      }),
    };
  } catch (error) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        username: null,
        error: 'Could not delete sessions.',
      }),
    };
  }
};

exports.handler = makeHandler({ handler, inputSchema });
