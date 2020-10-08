// @ts-ignore
import AWS = require('aws-sdk');

import { createResponse } from './createResponse';

const tableName = process.env.TODO_TABLE_NAME;
const dynamodb = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (event: AWSLambda.APIGatewayEvent) {
  try {
    const { httpMethod, body } = event;

    if (httpMethod === 'GET') {
      const response = await dynamodb
        .scan({
          TableName: tableName,
        })
        .promise();

      return createResponse(response.Items || []);
    }

    if (!body) {
      return createResponse('Missing request body', 500);
    }

    const data = JSON.parse(body);

    if (httpMethod === 'POST') {
      const { todo } = data;
      const randomString = Math.random().toString(36).substring(2);

      if (todo && todo !== '') {
        await dynamodb
          .put({
            TableName: tableName,
            Item: {
              id: randomString,
              todo,
            },
          })
          .promise();

        return createResponse(`${todo} added to the database`);
      }

      return createResponse('Todo is missing', 500);
    }

    if (httpMethod === 'DELETE') {
      const { id } = data;

      if (id && id !== '') {
        await dynamodb
          .delete({
            TableName: tableName,
            Key: {
              id,
            },
          })
          .promise();

        return createResponse(
          `Todo item with an id of ${id} deleted from the database`
        );
      }

      return createResponse('ID is missing', 500);
    }

    return createResponse(
      `We only accept GET, POST, OPTIONS and DELETE, not ${httpMethod}`,
      500
    );
  } catch (error) {
    console.error(error);
    return createResponse(error, 500);
  }
};
