const DynamoDB = require('aws-sdk/clients/dynamodb');

const { USERS_TABLE } = process.env;
const DocumentClient = new DynamoDB.DocumentClient();

const getUserByScreenName = async screenName => {
  const resp = await DocumentClient.query({
    TableName: USERS_TABLE,
    KeyConditionExpression: 'screenName = :screenName',
    ExpressionAttributeValues: {
      ':screenName': screenName,
    },
    IndexName: 'byScreenName',
    Limit: 1,
  }).promise();

  if (resp.Items.length === 0) {
    return;
  }

  return resp.Items[0];
};

module.exports = {
  getUserByScreenName,
};
