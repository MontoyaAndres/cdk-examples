const DynamoDB = require('aws-sdk/clients/dynamodb');

const Response = require('../common/response');

const dynamodb = new DynamoDB.DocumentClient();
const tableName = process.env.tableName;

exports.handler = async event => {
  const { id } = event.pathParameters;

  if (!id) {
    return Response({ message: 'Missing id' }, 404);
  }

  const user = await dynamodb
    .get({
      TableName: tableName,
      Key: {
        id,
      },
    })
    .promise();

  if (Object.keys(user).length === 0) {
    return Response({ message: 'User not found' }, 404);
  }

  return Response({ data: user.Item });
};
