require('dotenv').config();
const fs = require('fs');
const AWS = require('aws-sdk');
const {
  CognitoIdentityProvider,
} = require('@aws-sdk/client-cognito-identity-provider');
const { S3 } = require('@aws-sdk/client-s3');
const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const ulid = require('ulid');
const chunk = require('lodash.chunk');

const {
  MenuTypes,
  UserTypes,
  DynamoDBMaxBatchSize,
} = require('../lib/constants');
const ADDITIONAL_INFORMATION = require('./ADDITIONAL_INFORMATION.json');

const {
  AWS_PROFILE_NAME,
  AWS_REGION,
  MENU_TABLE_NAME,
  USER_TABLE_NAME,
  S3_BUCKET,
  COGNITO_USER_POOL,
  COGNITO_CLIENT_ID,
  COGNITO_SUPER_ADMIN_NAME,
  COGNITO_SUPER_ADMIN_LASTNAME,
  COGNITO_SUPER_ADMIN_EMAIL,
  COGNITO_SUPER_ADMIN_PASSWORD,
} = process.env;

const credentials = new AWS.SharedIniFileCredentials({
  profile: AWS_PROFILE_NAME,
});
AWS.config.credentials = credentials;

const cognitoClient = new CognitoIdentityProvider({
  region: AWS_REGION,
  credentials: credentials,
});
const s3Client = new S3({
  region: AWS_REGION,
  credentials: credentials,
});
const dynamodbClient = new DynamoDB({
  region: AWS_REGION,
  credentials: credentials,
});

function addParentIdToMenus() {
  const currentMenus = ADDITIONAL_INFORMATION.menus;
  const response = [];

  const loop = (menus = currentMenus, parentId) => {
    for (let menu of menus) {
      let id = ulid.ulid();

      if (!menu?.parentId) {
        menu = { id, ...menu };
      }

      if (parentId) {
        menu = { id, parentId, ...menu };
      }

      if (menu.menus) {
        loop(menu.menus, id);
      }

      response.push(menu);
    }
  };

  loop();

  if (response.length > 0) {
    response.forEach(res => {
      if (res?.menus) {
        delete res.menus;
      }
    });

    return response;
  }
}

async function getMenusFromDatabase(tableName) {
  const loop = async (acc, exclusiveStartKey) => {
    const response = await dynamodbClient.scan({
      TableName: tableName,
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

async function updateDynamoDBTable() {
  const currentDate = new Date().toJSON();

  const localMenus = addParentIdToMenus();
  const cloudMenus = await getMenusFromDatabase(MENU_TABLE_NAME);

  const newMenus = localMenus.filter(
    menu => !cloudMenus.some(item => item.name.S === menu.name)
  );
  const removeMenus = cloudMenus.filter(
    menu => !localMenus.some(item => item.name === menu.name.S)
  );

  if (newMenus.length > 0) {
    const menusWriteEntries = newMenus.map(menu => ({
      PutRequest: {
        Item: marshall({
          ...menu,
          icon: menu.icon
            ? `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${menu.icon}`
            : '',
          iconActive: menu.iconActive
            ? `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${menu.iconActive}`
            : '',
          __typename: MenuTypes.MENU,
          createdAt: currentDate,
          updatedAt: currentDate,
        }),
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
            [MENU_TABLE_NAME]: chunk,
          },
        })
    );

    await Promise.all(promises);
  }

  if (removeMenus.length > 0) {
    const removeMenusEntries = removeMenus.map(menu => ({
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
            [MENU_TABLE_NAME]: chunk,
          },
        })
    );

    await Promise.all(promises);
  }
}

async function updateS3Bucket() {
  const dir = `${__dirname}/MENUS_ICONS`;

  const images = fs.readdirSync(dir);
  const files = images.map(image => ({
    Body: fs.readFileSync(`${dir}/${image}`),
    Key: `public/menu_icons/${image}`,
  }));

  await Promise.all(
    files.map(async file => {
      await s3Client.putObject({
        Bucket: S3_BUCKET,
        Body: file.Body,
        Key: file.Key,
      });
    })
  );
}

async function createSuperAdminUser() {
  const NAME = COGNITO_SUPER_ADMIN_NAME;
  const LAST_NAME = COGNITO_SUPER_ADMIN_LASTNAME;
  const EMAIL = COGNITO_SUPER_ADMIN_EMAIL;
  const PASSWORD = COGNITO_SUPER_ADMIN_PASSWORD;

  const cognitoUser = await cognitoClient.signUp({
    ClientId: COGNITO_CLIENT_ID,
    Username: EMAIL,
    Password: PASSWORD,
    UserAttributes: [
      {
        Name: 'email',
        Value: EMAIL,
      },
    ],
  });

  await cognitoClient
    .createGroup({
      UserPoolId: COGNITO_USER_POOL,
      GroupName: 'SuperAdmin',
    })
    .then(async () => {
      await cognitoClient.adminAddUserToGroup({
        UserPoolId: COGNITO_USER_POOL,
        GroupName: 'SuperAdmin',
        Username: cognitoUser.UserSub,
      });

      await cognitoClient.adminUpdateUserAttributes({
        UserPoolId: COGNITO_USER_POOL,
        Username: cognitoUser.UserSub,
        UserAttributes: [
          {
            Name: 'email_verified',
            Value: 'true',
          },
        ],
      });

      await cognitoClient.adminSetUserPassword({
        UserPoolId: COGNITO_USER_POOL,
        Username: cognitoUser.UserSub,
        Password: PASSWORD,
        Permanent: true,
      });

      const currentDate = new Date().toJSON();

      await dynamodbClient.putItem({
        TableName: USER_TABLE_NAME,
        Item: marshall({
          __typename: UserTypes.USER,
          createdAt: currentDate,
          updatedAt: currentDate,
          id: cognitoUser.UserSub,
          name: NAME,
          lastName: LAST_NAME,
          email: EMAIL,
          isActive: true,
        }),
        ConditionExpression: 'attribute_not_exists(id)',
      });
    });
}

async function run() {
  if (
    !AWS_PROFILE_NAME ||
    !AWS_REGION ||
    !MENU_TABLE_NAME ||
    !USER_TABLE_NAME ||
    !USER_TABLE_NAME ||
    !S3_BUCKET ||
    !COGNITO_USER_POOL ||
    !COGNITO_CLIENT_ID ||
    !COGNITO_SUPER_ADMIN_NAME ||
    !COGNITO_SUPER_ADMIN_LASTNAME ||
    !COGNITO_SUPER_ADMIN_EMAIL ||
    !COGNITO_SUPER_ADMIN_PASSWORD
  ) {
    throw new Error('Missing variables');
  }

  const command = process.argv[2];

  if (command === 'UPDATE_DATABASE') {
    await updateDynamoDBTable();
  }

  if (command === 'UPDATE_BUCKET') {
    await updateS3Bucket();
  }

  if (command === 'CREATE_SUPER_ADMIN_USER') {
    await createSuperAdminUser();
  }
}

run();
