const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const { ROLE_TABLE, USER_BY_ROLE_TABLE } = process.env;

const dynamodbClient = new DynamoDB();

module.exports.handler = async event => {
  let {
    identity: { username, groups, claims },
    arguments: { accountId, userId },
  } = event;
  const id = userId || username;
  const isSuperAdmin = groups?.includes('SuperAdmin');

  if (!isSuperAdmin) {
    const accounts = JSON.parse(claims['custom:accounts']);
    const index = accounts.indexOf(accountId);

    accountId = accounts[index];

    if (!accountId) {
      throw new Error('Account not found');
    }
  }

  const resolvers = {
    Query: {
      rolesByUser: async () => {
        const roles = await rolesByUserQuery(accountId, id);

        return roles;
      },
      rolesByAccount: async () => {
        const roles = await rolesByAccountQuery(accountId);

        return roles;
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

async function rolesByUserQuery(accountId, userId) {
  const rolesByUser = await dynamodbClient.query({
    TableName: USER_BY_ROLE_TABLE,
    IndexName: 'byUserByRole',
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': { S: userId },
    },
    ProjectionExpression: 'roleId',
  });

  if (rolesByUser.Items.length === 0) return [];

  const rolesReadEntries = {
    RequestItems: {
      [ROLE_TABLE]: {
        Keys: rolesByUser.Items.map(role => ({
          id: role.roleId,
          accountId: { S: accountId },
        })),
        ExpressionAttributeNames: {
          '#name': 'name',
        },
        ProjectionExpression: 'id, #name, isActive, usersAmount',
      },
    },
  };

  const roles = await dynamodbClient.batchGetItem(rolesReadEntries);

  if (roles.Responses[ROLE_TABLE].length === 0) return [];

  const response = roles.Responses[ROLE_TABLE].map(role => unmarshall(role));

  return response;
}

async function rolesByAccountQuery(accountId) {
  const rolesByAccount = await dynamodbClient.query({
    TableName: ROLE_TABLE,
    IndexName: 'byAccountId',
    KeyConditionExpression: 'accountId = :accountId',
    ExpressionAttributeValues: {
      ':accountId': { S: accountId },
    },
  });

  if (rolesByAccount.Items.length === 0) return [];

  const response = rolesByAccount.Items.map(role => unmarshall(role));

  return response;
}
