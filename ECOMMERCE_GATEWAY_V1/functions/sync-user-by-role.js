const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const middy = require('@middy/core');
const ssm = require('@middy/ssm');

const { initUsersByRoleIndex } = require('../lib/algolia');

const { STAGE, USER_TABLE } = process.env;

const dynamodbClient = new DynamoDB();

module.exports.handler = middy(async (event, context) => {
  const index = await initUsersByRoleIndex(
    context.ALGOLIA_APPLICATION_ID,
    context.ALGOLIA_API_KEY,
    STAGE
  );

  await Promise.all(
    event.Records.map(async record => {
      if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
        const values = unmarshall(record.dynamodb.NewImage);

        try {
          await partialContentToAlgolia(values, index);
        } catch (error) {
          console.error(error);

          throw new Error(error);
        }
      }
    })
  );
}).use(
  ssm({
    cacheExpiry: 5 * 60 * 1000, // 5 mins
    fetchData: {
      ALGOLIA_APPLICATION_ID: `/${STAGE}/algolia-app-id`,
      ALGOLIA_API_KEY: `/${STAGE}/algolia-admin-key`,
    },
    setToContext: true,
  })
);

async function partialContentToAlgolia(values, index) {
  const { id, roleId, userId } = values;

  const currentUser = await dynamodbClient.getItem({
    TableName: USER_TABLE,
    Key: {
      id: { S: userId },
    },
    ProjectionExpression:
      'id, #name, lastName, email, picture, #status, createdAt',
    ExpressionAttributeNames: {
      '#name': 'name',
      '#status': 'status',
    },
  });
  const user = unmarshall(currentUser.Item);
  const createdAt_timestamp = Math.round(+new Date(user.createdAt) / 1000);

  await index.partialUpdateObject(
    {
      objectID: id,
      userId: user.id,
      roleId: roleId,
      name: user.name,
      lastName: user.lastName,
      email: user.email,
      picture: user.picture,
      status: user.status,
      createdAt: user.createdAt,
      createdAt_timestamp,
    },
    {
      createIfNotExists: true,
    }
  );

  return values;
}
