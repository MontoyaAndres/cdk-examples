const { unmarshall } = require('@aws-sdk/util-dynamodb');
const middy = require('@middy/core');
const ssm = require('@middy/ssm');

const { initInvitationsByRoleIndex } = require('../lib/algolia');

const { STAGE } = process.env;

module.exports.handler = middy(async (event, context) => {
  const index = await initInvitationsByRoleIndex(
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
  const createdAt_timestamp = Math.round(+new Date(values.createdAt) / 1000);

  await index.partialUpdateObject(
    {
      objectID: values.id,
      accountId: values.accountId,
      status: values.status,
      expiration: values.expiration,
      email: values.email,
      guestId: values.guestId,
      ownerId: values.ownerId,
      roleId: values.roleId,
      createdAt: values.createdAt,
      createdAt_timestamp,
    },
    {
      createIfNotExists: true,
    }
  );

  return values;
}
