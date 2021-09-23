const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const { USER_TABLE, ACCOUNT_BY_USER_TABLE, ACCOUNT_TABLE } = process.env;

const dynamodbClient = new DynamoDB();

module.exports.handler = async event => {
  const {
    identity: { username },
    arguments: { userId },
  } = event;
  const id = userId || username;

  const resolvers = {
    Query: {
      user: async () => {
        const user = await getUser(id);

        return user;
      },
    },
    User: {
      accounts: async () => {
        const accounts = await listAccounts(id);

        return accounts;
      },
    },
  };

  const typeHandler = resolvers[event.info.parentTypeName];

  if (typeHandler) {
    const resolver = typeHandler[event.info.fieldName];

    if (resolver) {
      return await resolver(event);
    }
  }

  throw new Error('Resolver not found');
};

async function getUser(userId) {
  const user = await dynamodbClient.getItem({
    TableName: USER_TABLE,
    Key: {
      id: {
        S: userId,
      },
    },
  });
  const response = unmarshall(user.Item);

  return response;
}

async function listAccounts(userId) {
  const accountsByUser = await dynamodbClient.query({
    TableName: ACCOUNT_BY_USER_TABLE,
    IndexName: 'byUserByAccount',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': { S: userId },
    },
    ProjectionExpression: 'accountId',
  });

  if (accountsByUser.Items.length === 0) return [];

  const accountsReadEntries = {
    RequestItems: {
      [ACCOUNT_TABLE]: {
        Keys: accountsByUser.Items.map(account => ({
          id: account.accountId,
        })),
        ExpressionAttributeNames: {
          '#name': 'name',
        },
        ProjectionExpression: 'id, #name, picture, isActive',
      },
    },
  };

  const accounts = await dynamodbClient.batchGetItem(accountsReadEntries);

  if (accounts.Responses[ACCOUNT_TABLE].length === 0) return [];

  const response = accounts.Responses[ACCOUNT_TABLE].map(account =>
    unmarshall(account)
  );

  return response;
}
