const {
  CognitoIdentityProvider,
} = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const ulid = require('ulid');

const { ActionTypes } = require('../lib/constants');
const { DynamoDBExpressions } = require('../lib/dynamoDBExpressions');

const { ACTION_TABLE, USER_POOL_ID } = process.env;

const cognitoClient = new CognitoIdentityProvider();
const client = new DynamoDB();

module.exports.handler = async event => {
  const {
    arguments: { input },
  } = event;
  const currentDate = new Date().toJSON();

  const action = {
    ...input,
    __typename: ActionTypes.ACTION,
  };

  const resolvers = {
    Mutation: {
      createAction: async () => {
        try {
          await createActionMutation(action, currentDate);

          return true;
        } catch (error) {
          console.error(error);

          throw new Error(error);
        }
      },
      updateAction: async () => {
        try {
          await updateActionMutation(action, currentDate);

          return true;
        } catch (error) {
          console.error(error);

          throw new Error(error);
        }
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

async function createActionMutation(action, currentDate) {
  const request = {
    ...action,
    id: ulid.ulid(),
    createdAt: currentDate,
    updatedAt: currentDate,
  };

  try {
    const currentGroups = await listGroups().then(groups =>
      groups.map(({ GroupName }) => GroupName)
    );
    const newGroups = request.groups.filter(
      group => !currentGroups.includes(group)
    );

    await Promise.all(
      newGroups.map(
        async group =>
          await cognitoClient.createGroup({
            UserPoolId: USER_POOL_ID,
            GroupName: group,
          })
      )
    );

    await client.putItem({
      TableName: ACTION_TABLE,
      Item: marshall(request, {
        removeUndefinedValues: true,
      }),
    });
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}

async function updateActionMutation(action, currentDate) {
  const request = {
    ...action,
    updatedAt: currentDate,
  };
  const {
    UpdateExpression,
    ExpressionAttributeNames,
    ExpressionAttributeValues,
  } = DynamoDBExpressions(request);

  try {
    await client.updateItem({
      TableName: ACTION_TABLE,
      Key: {
        id: { S: request.id },
      },
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues: marshall(ExpressionAttributeValues),
      ConditionExpression: 'attribute_exists(id)',
    });
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}

async function listGroups() {
  const loop = async (acc, nextToken) => {
    const response = await cognitoClient.listGroups({
      UserPoolId: USER_POOL_ID,
      NextToken: nextToken,
    });

    const groups = response.Groups || [];
    const newAcc = acc.concat(groups);

    if (response.NextToken) {
      return await loop(newAcc, response.NextToken);
    } else {
      return newAcc;
    }
  };

  return await loop([]);
}
