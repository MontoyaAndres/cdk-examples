const {
  CognitoIdentityProvider,
} = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');

const { UserTypes } = require('../lib/constants');
const { DynamoDBExpressions } = require('../lib/dynamoDBExpressions');

const cognitoClient = new CognitoIdentityProvider();
const dynamodbClient = new DynamoDB();

const { USER_TABLE, COGNITO_USER_POOL_CLIENT_ID, COGNITO_USER_POOL } =
  process.env;

module.exports.handler = async event => {
  const {
    identity: { username, groups },
    arguments: { input },
  } = event;
  const isSuperAdmin = groups?.includes('SuperAdmin');
  let userId = input.userId || username;

  const resolvers = {
    Mutation: {
      registerUser: async () => {
        await registerUserMutation(input);

        return true;
      },
      confirmUser: async () => {
        await confirmUserMutation(input, userId);

        return true;
      },
      updateUser: async () => {
        await updateUserMutation(input, userId, isSuperAdmin);

        return true;
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

async function registerUserMutation(input) {
  try {
    const user = await cognitoClient.signUp({
      ClientId: COGNITO_USER_POOL_CLIENT_ID,
      Username: input.email,
      Password: input.password,
      UserAttributes: [
        {
          Name: 'email',
          Value: input.email,
        },
        {
          Name: 'custom:accounts',
          Value: JSON.stringify([]),
        },
      ],
    });

    if (!user.UserSub) {
      throw new Error('Not UserSub found');
    }

    const currentDate = new Date().toJSON();

    await dynamodbClient.putItem({
      TableName: USER_TABLE,
      Item: marshall({
        __typename: UserTypes.USER,
        createdAt: currentDate,
        updatedAt: currentDate,
        id: user.UserSub,
        name: input.name,
        lastName: input.lastName,
        email: input.email,
        status: UserTypes.USER_STATUS.PENDING,
      }),
      ConditionExpression: 'attribute_not_exists(id)',
    });
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}

async function confirmUserMutation(input, userId) {
  try {
    if (input.userId) {
      delete input.userId;
    }

    await cognitoClient.confirmSignUp({
      ClientId: COGNITO_USER_POOL_CLIENT_ID,
      Username: userId,
      ConfirmationCode: input.code,
    });

    const currentDate = new Date().toJSON();
    const request = {
      id: userId,
      status: UserTypes.USER_STATUS.APPROVED,
      updatedAt: currentDate,
    };
    const {
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    } = DynamoDBExpressions(request);

    await dynamodbClient.updateItem({
      TableName: USER_TABLE,
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

async function updateUserMutation(input, userId, isSuperAdmin) {
  try {
    if (input.userId) {
      delete input.userId;
    }

    if (!userId) {
      throw new Error('User not found');
    }

    if (input.email) {
      await cognitoClient.adminUpdateUserAttributes({
        UserPoolId: COGNITO_USER_POOL,
        Username: userId,
        UserAttributes: [
          {
            Name: 'email',
            Value: input.email,
          },
        ],
      });
    }

    if (isSuperAdmin) {
      if (input.status === 'APPROVED') {
        await cognitoClient.adminEnableUser({
          UserPoolId: COGNITO_USER_POOL,
          Username: userId,
        });
      }

      if (input.status === 'BLOCKED') {
        await cognitoClient.adminDisableUser({
          UserPoolId: COGNITO_USER_POOL,
          Username: userId,
        });
      }
    }

    const currentDate = new Date().toJSON();
    const request = {
      ...input,
      id: userId,
      updatedAt: currentDate,
    };
    const {
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    } = DynamoDBExpressions(request);

    await dynamodbClient.updateItem({
      TableName: USER_TABLE,
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
