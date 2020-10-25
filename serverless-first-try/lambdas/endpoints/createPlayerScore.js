const DynamoDB = require('aws-sdk/clients/dynamodb');

const Response = require('../common/response');

const dynamodb = new DynamoDB.DocumentClient();
const tableName = process.env.tableName;

exports.handler = async event => {
  const id = Math.random().toString(36).substring(7);
  const body = JSON.parse(event.body);
  const user = { id, ...body };

  if (Object.keys(event.body).length === 0) {
    return Response({ message: 'Not arguments found' }, 404);
  }

  const newUser = await dynamodb
    .put({
      TableName: tableName,
      Item: user,
    })
    .promise();

  if (!newUser) {
    throw new Error('Something went wrong on the table' + newUser);
  }

  return Response({ newUser });
};
