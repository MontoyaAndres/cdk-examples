'use strict';

const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const defaultRestaurants = process.env.DEFAULT_RESTAURANTS || 10;
const tableName = process.env.TABLE_NAME;

async function listRestaurants(count) {
  const restaurants = await dynamodb
    .scan({
      TableName: tableName,
      Limit: count,
    })
    .promise();

  return restaurants.Items;
}

module.exports.handler = async () => {
  const restaurants = await listRestaurants(defaultRestaurants);

  return {
    statusCode: 200,
    body: JSON.stringify(restaurants),
    headers: {
      'Content-Type': 'application/json',
    },
  };
};
