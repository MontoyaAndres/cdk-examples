// @ts-ignore
import AWS = require('aws-sdk');

export const createResponse = (
  body: string | AWS.DynamoDB.DocumentClient.ItemList,
  statusCode = 200
) => {
  return {
    statusCode,
    body: JSON.stringify(body, null, 2),
  };
};
