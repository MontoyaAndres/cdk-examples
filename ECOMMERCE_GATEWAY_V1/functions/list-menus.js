const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const sortBy = require('lodash.sortby');

const { MENU_TABLE, ROLE_TABLE, USER_BY_ROLE_TABLE, MENU_BY_ROLE_TABLE } =
  process.env;

const dynamodbClient = new DynamoDB();
let localMenus = [];

module.exports.handler = async event => {
  let {
    identity: { username, groups, claims },
    arguments: args,
  } = event;
  const isSuperAdmin = groups?.includes('SuperAdmin');
  let accountId = args?.accountId;

  if (!isSuperAdmin && accountId) {
    const accounts = JSON.parse(claims['custom:accounts']);
    const index = accounts.indexOf(accountId);

    accountId = accounts[index];

    if (!accountId) {
      throw new Error('Account not found');
    }
  }

  const resolvers = {
    Query: {
      menus: async () => {
        const menus = await listMenusQuery(username, isSuperAdmin, accountId);

        return menus;
      },
    },
    Role: {
      menus: async context => {
        const {
          source: { id },
        } = context;

        const menus = await listMenusByRole(id);

        return menus;
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

async function listMenusQuery(username, isSuperAdmin, accountId) {
  if (localMenus.length === 0) {
    const currentMenus = await getAllMenus();

    localMenus = currentMenus;
  }

  if (isSuperAdmin) {
    return await formatMenuList(localMenus);
  }

  const rolesByUser = await getAllRolesByUser(username);
  const rolesByAccount = await getAllRolesByAccount(accountId);

  const finalRolesByUser = rolesByUser.filter(roleByUser =>
    rolesByAccount.some(
      roleByAccount => roleByAccount.id.S === roleByUser.roleId.S
    )
  );

  if (finalRolesByUser.length === 0) return [];

  const menusByRole = await Promise.all(
    finalRolesByUser.map(
      async role =>
        await dynamodbClient.query({
          TableName: MENU_BY_ROLE_TABLE,
          IndexName: 'byRoleByMenu',
          KeyConditionExpression: 'roleId = :roleId',
          ExpressionAttributeValues: {
            ':roleId': role.roleId,
          },
          ProjectionExpression: 'menuId',
        })
    )
  );

  const menusIds = [];

  for (let menuByRole of menusByRole) {
    for (let item of menuByRole.Items) {
      menusIds.push(item.menuId.S);
    }
  }

  const set = new Set(menusIds);
  const menus = Array.from(set);

  const finalMenus = localMenus.filter(local =>
    menus.some(menu => local.id.S === menu)
  );

  return await formatMenuList(finalMenus);
}

async function listMenusByRole(roleId) {
  const menusByRole = await dynamodbClient.query({
    TableName: MENU_BY_ROLE_TABLE,
    IndexName: 'byRoleByMenu',
    KeyConditionExpression: 'roleId = :roleId',
    ExpressionAttributeValues: {
      ':roleId': { S: roleId },
    },
    ProjectionExpression: 'menuId',
  });

  if (menusByRole.Items.length === 0) return [];

  const menusIds = [];

  for (let item of menusByRole.Items) {
    menusIds.push(item.menuId.S);
  }

  const set = new Set(menusIds);
  const menus = Array.from(set);

  const menusReadEntries = {
    RequestItems: {
      [MENU_TABLE]: {
        Keys: menus.map(menu => ({
          id: { S: menu },
        })),
      },
    },
  };

  const currentMenus = await dynamodbClient.batchGetItem(menusReadEntries);

  const finalMenus = currentMenus.Responses[MENU_TABLE].filter(local =>
    menus.some(menu => local.id.S === menu)
  );

  return await formatMenuList(finalMenus);
}

async function getAllMenus() {
  const loop = async (acc, exclusiveStartKey) => {
    const response = await dynamodbClient.scan({
      TableName: MENU_TABLE,
      ExclusiveStartKey: exclusiveStartKey,
    });

    const menus = response.Items || [];
    const newAcc = acc.concat(menus);

    if (response.LastEvaluatedKey) {
      return await loop(newAcc, response.LastEvaluatedKey);
    } else {
      return newAcc;
    }
  };

  return await loop([]);
}

async function getAllRolesByUser(userId) {
  const loop = async (acc, exclusiveStartKey) => {
    const response = await dynamodbClient.query({
      TableName: USER_BY_ROLE_TABLE,
      IndexName: 'byUserByRole',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': { S: userId },
      },
      ProjectionExpression: 'roleId',
      ExclusiveStartKey: exclusiveStartKey,
    });

    const menus = response.Items || [];
    const newAcc = acc.concat(menus);

    if (response.LastEvaluatedKey) {
      return await loop(newAcc, response.LastEvaluatedKey);
    } else {
      return newAcc;
    }
  };

  return await loop([]);
}

async function getAllRolesByAccount(accountId) {
  const loop = async (acc, exclusiveStartKey) => {
    const response = await dynamodbClient.query({
      TableName: ROLE_TABLE,
      IndexName: 'byAccountId',
      KeyConditionExpression: 'accountId = :accountId',
      ExpressionAttributeValues: {
        ':accountId': { S: accountId },
      },
      ProjectionExpression: 'id',
      ExclusiveStartKey: exclusiveStartKey,
    });

    const menus = response.Items || [];
    const newAcc = acc.concat(menus);

    if (response.LastEvaluatedKey) {
      return await loop(newAcc, response.LastEvaluatedKey);
    } else {
      return newAcc;
    }
  };

  return await loop([]);
}

async function formatMenuList(menuList) {
  if (menuList.length === 0) return [];

  const menus = menuList.map(menu => ({
    __typename: menu.__typename.S,
    id: menu.id.S,
    parentId: menu.parentId?.S,
    name: menu.name.S,
    displayName: menu.displayName?.S,
    icon: menu.icon?.S,
    iconActive: menu.iconActive?.S,
    path: menu.path?.S,
    isActive: menu.isActive.BOOL,
    position: menu.position.N,
    permissions: menu.permissions.L.map(permission => permission.S),
    additionalInfo: menu.additionalInfo?.M,
  }));

  const menuSorted = sortBy(menus, ['position']);

  const menuListTree = (menuList = menuSorted, id) =>
    menuList
      .filter(item => item['parentId'] === id)
      .map(item => ({
        ...item,
        menus: menuListTree(menuList, item.id),
      }));

  const finalMenu = menuListTree();

  return finalMenu;
}
