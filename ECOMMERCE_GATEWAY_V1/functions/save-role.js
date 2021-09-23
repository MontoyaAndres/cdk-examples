const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const ulid = require('ulid');
const chunk = require('lodash.chunk');

const { RoleTypes, DynamoDBMaxBatchSize } = require('../lib/constants');

const { ACCOUNT_TABLE, ROLE_TABLE, MENU_TABLE, MENU_BY_ROLE_TABLE } =
  process.env;

const dynamodbClient = new DynamoDB();

module.exports.handler = async event => {
  const {
    identity: { groups, claims },
    arguments: { input },
  } = event;
  const currentDate = new Date().toJSON();
  const isSuperAdmin = groups?.includes('SuperAdmin');
  let accountId = input?.accountId;

  if (!isSuperAdmin) {
    const accounts = JSON.parse(claims['custom:accounts']);
    const index = accounts.indexOf(accountId);

    accountId = accounts[index];

    if (!accountId) {
      throw new Error('Account not found');
    }
  }

  const resolvers = {
    Mutation: {
      createRole: async () => {
        await createRoleMutation(input, currentDate, accountId);

        return true;
      },
      updateRole: async () => {
        await updateRoleMutation(input, currentDate, accountId);

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

async function createRoleMutation(input, currentDate, accountId) {
  try {
    const currentAccount = await dynamodbClient.getItem({
      TableName: ACCOUNT_TABLE,
      Key: {
        id: { S: accountId },
      },
      ProjectionExpression: 'id',
    });

    if (!currentAccount.Item) {
      throw new Error('Account not found');
    }

    const menusReadEntries = {
      RequestItems: {
        [MENU_TABLE]: {
          Keys: input.menus.map(menu => ({
            id: { S: menu },
          })),
          ProjectionExpression: 'id',
        },
      },
    };

    const currentMenus = await dynamodbClient.batchGetItem(menusReadEntries);

    if (currentMenus.Responses[MENU_TABLE].length !== input.menus.length) {
      throw new Error('Menus not found');
    }

    const roleEntry = {
      id: ulid.ulid(),
      __typename: RoleTypes.ROLE,
      accountId: accountId,
      name: input.name,
      isActive: input.isActive || true,
      usersAmount: 0,
      createdAt: currentDate,
      updatedAt: currentDate,
    };

    await dynamodbClient.putItem({
      TableName: ROLE_TABLE,
      Item: marshall(roleEntry),
      ConditionExpression: 'attribute_not_exists(id)',
    });

    const menusWriteEntries = input.menus.map(menu => ({
      PutRequest: {
        Item: marshall({
          id: ulid.ulid(),
          roleId: roleEntry.id,
          menuId: menu,
        }),
        ConditionExpression: 'attribute_not_exists(id)',
      },
    }));

    const chunks = chunk(
      menusWriteEntries,
      DynamoDBMaxBatchSize.MAX_BATCH_SIZE
    );

    const promises = chunks.map(
      async chunk =>
        await dynamodbClient.batchWriteItem({
          RequestItems: {
            [MENU_BY_ROLE_TABLE]: chunk,
          },
        })
    );

    await Promise.all(promises);
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}

async function updateRoleMutation(input, currentDate, accountId) {
  try {
    const menusReadEntries = {
      RequestItems: {
        [MENU_TABLE]: {
          Keys: input.menus.map(menu => ({
            id: { S: menu },
          })),
          ProjectionExpression: 'id',
        },
      },
    };

    const currentMenus = await dynamodbClient.batchGetItem(menusReadEntries);

    if (currentMenus.Responses[MENU_TABLE].length !== input.menus.length) {
      throw new Error('Menus not found');
    }

    const currentMenusByRole = await dynamodbClient.query({
      TableName: MENU_BY_ROLE_TABLE,
      IndexName: 'byRoleByMenu',
      KeyConditionExpression: 'roleId = :roleId',
      ExpressionAttributeValues: {
        ':roleId': { S: input.id },
      },
    });

    if (currentMenusByRole.Items.length === 0) {
      throw new Error('Role not found');
    }

    const newMenusByRole = input.menus.filter(
      menu => !currentMenusByRole.Items.some(item => item.menuId.S === menu)
    );
    const removeMenusByRole = currentMenusByRole.Items.filter(
      item => !input.menus.includes(item.menuId.S)
    );

    if (newMenusByRole.length > 0) {
      const newMenusEntries = newMenusByRole.map(menu => ({
        PutRequest: {
          Item: marshall({
            id: ulid.ulid(),
            roleId: input.id,
            menuId: menu,
          }),
        },
      }));

      const chunks = chunk(
        newMenusEntries,
        DynamoDBMaxBatchSize.MAX_BATCH_SIZE
      );

      const promises = chunks.map(
        async chunk =>
          await dynamodbClient.batchWriteItem({
            RequestItems: {
              [MENU_BY_ROLE_TABLE]: chunk,
            },
          })
      );

      await Promise.all(promises);
    }

    if (removeMenusByRole.length > 0) {
      const removeMenusEntries = removeMenusByRole.map(menu => ({
        DeleteRequest: {
          Key: {
            id: menu.id,
          },
        },
      }));

      const chunks = chunk(
        removeMenusEntries,
        DynamoDBMaxBatchSize.MAX_BATCH_SIZE
      );

      const promises = chunks.map(
        async chunk =>
          await dynamodbClient.batchWriteItem({
            RequestItems: {
              [MENU_BY_ROLE_TABLE]: chunk,
            },
          })
      );

      await Promise.all(promises);
    }

    await dynamodbClient.updateItem({
      TableName: ROLE_TABLE,
      Key: {
        id: { S: input.id },
        accountId: { S: accountId },
      },
      UpdateExpression:
        'SET #name = :name, isActive = :isActive, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#name': 'name',
      },
      ExpressionAttributeValues: {
        ':name': { S: input.name },
        ':isActive': { BOOL: input.isActive || true },
        ':updatedAt': { S: currentDate },
      },
    });
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}
