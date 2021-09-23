const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const {
  CognitoIdentityProvider,
} = require('@aws-sdk/client-cognito-identity-provider');
const ulid = require('ulid');

const { InvitationTypes } = require('../lib/constants');

const {
  INVITATION_TABLE,
  ROLE_TABLE,
  USER_TABLE,
  ACCOUNT_TABLE,
  ACCOUNT_BY_USER_TABLE,
  USER_BY_ROLE_TABLE,
  COGNITO_USER_POOL,
} = process.env;

const dynamodbClient = new DynamoDB();
const cognitoClient = new CognitoIdentityProvider();

module.exports.handler = async event => {
  const {
    identity: { username, groups, claims },
    arguments: { input },
  } = event;
  const currentDate = new Date().toJSON();
  const isSuperAdmin = groups?.includes('SuperAdmin');
  let accountId = input?.accountId;

  const resolvers = {
    Mutation: {
      createInvitation: async () => {
        if (!isSuperAdmin) {
          const accounts = JSON.parse(claims['custom:accounts']);
          const index = accounts.indexOf(accountId);

          accountId = accounts[index];

          if (!accountId) {
            throw new Error('Account not found');
          }
        }

        await createInvitationMutation(input, currentDate, username, accountId);

        return true;
      },
      updateInvitation: async () => {
        await updateInvitationMutation(input, currentDate);

        return true;
      },
      resendInvitation: async () => {
        await resendInvitationMutation(input, currentDate);

        return true;
      },
      deleteInvitation: async () => {
        await deleteInvitationMutation(input, currentDate);

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

async function createInvitationMutation(
  input,
  currentDate,
  username,
  accountId
) {
  try {
    const currentAccount = await dynamodbClient.getItem({
      TableName: ACCOUNT_TABLE,
      Key: { id: { S: accountId } },
      ProjectionExpression: 'id',
    });

    if (!currentAccount.Item) {
      throw new Error('Account not found');
    }

    const currentRole = await dynamodbClient.getItem({
      TableName: ROLE_TABLE,
      Key: { id: { S: input.roleId }, accountId: { S: accountId } },
      ProjectionExpression: 'id',
    });

    if (!currentRole.Item) {
      throw new Error('Role not found');
    }

    const currentUser = await dynamodbClient.getItem({
      TableName: USER_TABLE,
      Key: { id: { S: username } },
      ProjectionExpression: 'id',
    });

    const secondsSinceEpoch = Math.round(Date.now() / 1000);
    // Time expiration is calculated in minutes
    const expiration = secondsSinceEpoch + input.expiration * 60;

    const promises = input.emails.map(async email => {
      const guestUser = await dynamodbClient.query({
        TableName: USER_TABLE,
        IndexName: 'byEmail',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': { S: email },
        },
        ProjectionExpression: 'id',
      });
      const currentGuestUser = guestUser.Items[0];
      let invitationItem = {};

      if (currentGuestUser) {
        invitationItem = {
          __typename: InvitationTypes.INVITATION,
          id: ulid.ulid(),
          roleId: currentRole.Item.id.S,
          status: InvitationTypes.INVITATION_STATUS.PENDING,
          ownerId: currentUser.Item.id.S,
          guestId: currentGuestUser.id.S,
          accountId: currentAccount.Item.id.S,
          email: email,
          expiration: expiration,
          createdAt: currentDate,
          updatedAt: currentDate,
        };
      } else {
        invitationItem = {
          __typename: InvitationTypes.INVITATION,
          id: ulid.ulid(),
          roleId: currentRole.Item.id.S,
          status: InvitationTypes.INVITATION_STATUS.PENDING,
          ownerId: currentUser.Item.id.S,
          accountId: currentAccount.Item.id.S,
          email: email,
          expiration: expiration,
          createdAt: currentDate,
          updatedAt: currentDate,
        };
      }

      return dynamodbClient.putItem({
        TableName: INVITATION_TABLE,
        Item: marshall(invitationItem),
        ConditionExpression: 'attribute_not_exists(id)',
      });
    });

    await Promise.all(promises);
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}

async function updateInvitationMutation(input, currentDate) {
  try {
    const currentInvitation = await dynamodbClient.getItem({
      TableName: INVITATION_TABLE,
      Key: {
        id: {
          S: input.id,
        },
      },
    });

    if (!currentInvitation.Item) {
      throw new Error('Invitation not found');
    }

    if (
      currentInvitation.Item.status.S !==
      InvitationTypes.INVITATION_STATUS.PENDING
    ) {
      throw new Error('Invitation not valid');
    }

    const secondsSinceEpoch = Math.round(Date.now() / 1000);

    if (currentInvitation.Item.expiration.N < secondsSinceEpoch) {
      throw new Error('Invitation is expired');
    }

    if (!currentInvitation.Item.guestId && !input?.guestId) {
      throw new Error('Guest user not found');
    }

    if (input?.guestId) {
      const currentGuestUser = await dynamodbClient.getItem({
        TableName: USER_TABLE,
        Key: {
          id: {
            S: input.guestId,
          },
        },
        ProjectionExpression: 'id',
      });

      if (!currentGuestUser.Item) {
        throw new Error('Guest user not found');
      }
    }

    if (input.status === InvitationTypes.INVITATION_STATUS.APPROVED) {
      const currentCognitoAttributesFromUser = await cognitoClient.adminGetUser(
        {
          UserPoolId: COGNITO_USER_POOL,
          Username: input?.guestId || currentInvitation.Item.guestId.S,
        }
      );

      const index = currentCognitoAttributesFromUser.UserAttributes.findIndex(
        user => user.Name === 'custom:accounts'
      );
      const currentCognitoAccountsFromUser =
        currentCognitoAttributesFromUser.UserAttributes[index];

      if (currentCognitoAccountsFromUser) {
        if (
          JSON.parse(currentCognitoAccountsFromUser.Value).includes(
            currentInvitation.Item.accountId.S
          )
        ) {
          throw new Error('User is already in Account');
        }
      }

      let accountsValue = [];

      if (currentCognitoAccountsFromUser) {
        const currentAccounts = JSON.parse(
          currentCognitoAccountsFromUser.Value
        );
        currentAccounts.push(currentInvitation.Item.accountId.S);

        accountsValue = currentAccounts;
      } else {
        accountsValue = [currentInvitation.Item.accountId.S];
      }

      await cognitoClient.adminUpdateUserAttributes({
        UserPoolId: COGNITO_USER_POOL,
        Username: input?.guestId || currentInvitation.Item.guestId.S,
        UserAttributes: [
          {
            Name: 'custom:accounts',
            Value: JSON.stringify(accountsValue),
          },
        ],
      });

      await dynamodbClient.transactWriteItems({
        TransactItems: [
          {
            Put: {
              TableName: ACCOUNT_BY_USER_TABLE,
              Item: marshall({
                id: ulid.ulid(),
                accountId: currentInvitation.Item.accountId.S,
                userId: input?.guestId || currentInvitation.Item.guestId.S,
              }),
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
          {
            Put: {
              TableName: USER_BY_ROLE_TABLE,
              Item: marshall({
                id: ulid.ulid(),
                roleId: currentInvitation.Item.roleId.S,
                userId: input?.guestId || currentInvitation.Item.guestId.S,
              }),
              ConditionExpression: 'attribute_not_exists(id)',
            },
          },
          {
            Update: {
              TableName: ROLE_TABLE,
              Key: {
                id: currentInvitation.Item.roleId,
                accountId: currentInvitation.Item.accountId,
              },
              UpdateExpression: 'ADD usersAmount :one',
              ExpressionAttributeValues: {
                ':one': { N: '1' },
              },
              ConditionExpression: 'attribute_exists(id)',
            },
          },
        ],
      });
    }

    await dynamodbClient.updateItem({
      TableName: INVITATION_TABLE,
      Key: {
        id: { S: input.id },
      },
      UpdateExpression:
        'SET #status = :status, #guestId = :guestId, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#guestId': 'guestId',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: marshall({
        ':status': input.status,
        ':guestId': input?.guestId || currentInvitation.Item.guestId.S,
        ':updatedAt': currentDate,
      }),
      ConditionExpression: 'attribute_exists(id)',
    });
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}

async function resendInvitationMutation(input, currentDate) {
  try {
    const currentInvitation = await dynamodbClient.getItem({
      TableName: INVITATION_TABLE,
      Key: {
        id: {
          S: input.id,
        },
      },
    });

    if (!currentInvitation.Item) {
      throw new Error('Invitation not found');
    }

    if (
      currentInvitation.Item.status.S !==
      InvitationTypes.INVITATION_STATUS.PENDING
    ) {
      throw new Error('Invitation not valid');
    }

    let invitationItem = {
      __typename: { S: InvitationTypes.INVITATION },
      id: { S: ulid.ulid() },
      roleId: currentInvitation.Item.roleId,
      status: { S: InvitationTypes.INVITATION_STATUS.PENDING },
      ownerId: currentInvitation.Item.ownerId,
      accountId: currentInvitation.Item.accountId,
      email: currentInvitation.Item.email,
      expiration: currentInvitation.Item.expiration,
      createdAt: { S: currentDate },
      updatedAt: { S: currentDate },
    };

    if (currentInvitation.Item?.guestId?.S) {
      invitationItem = {
        ...invitationItem,
        guestId: currentInvitation.Item.guestId,
      };
    }

    await dynamodbClient.transactWriteItems({
      TransactItems: [
        {
          Put: {
            TableName: INVITATION_TABLE,
            Item: invitationItem,
            ConditionExpression: 'attribute_not_exists(id)',
          },
        },
        {
          Update: {
            TableName: INVITATION_TABLE,
            Key: {
              id: {
                S: input.id,
              },
            },
            UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#status': 'status',
              '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
              ':status': { S: InvitationTypes.INVITATION_STATUS.DELETED },
              ':updatedAt': { S: currentDate },
            },
            ConditionExpression: 'attribute_exists(id)',
          },
        },
      ],
    });
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}

async function deleteInvitationMutation(input, currentDate) {
  try {
    await dynamodbClient.updateItem({
      TableName: INVITATION_TABLE,
      Key: {
        id: { S: input.id },
      },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': { S: InvitationTypes.INVITATION_STATUS.DELETED },
        ':updatedAt': { S: currentDate },
      },
      ConditionExpression: 'attribute_exists(id)',
    });
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}
