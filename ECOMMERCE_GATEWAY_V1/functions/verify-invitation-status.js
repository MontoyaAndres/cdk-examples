const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const chunk = require('lodash.chunk');

const { InvitationTypes, DynamoDBMaxBatchSize } = require('../lib/constants');

const { INVITATION_TABLE } = process.env;

const dynamodbClient = new DynamoDB();

module.exports.handler = async () => {
  try {
    const invitations = await getInvitations();

    if (invitations.length === 0) return [];

    const currentDate = new Date().toJSON();

    const updateInvitationsTrasaction = invitations.map(invitation => ({
      Update: {
        TableName: INVITATION_TABLE,
        Key: {
          id: invitation.id,
        },
        UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: marshall({
          ':status': InvitationTypes.INVITATION_STATUS.DELETED,
          ':updatedAt': currentDate,
        }),
      },
    }));

    if (updateInvitationsTrasaction.length === 0) return [];

    const chunks = chunk(
      updateInvitationsTrasaction,
      DynamoDBMaxBatchSize.MAX_BATCH_SIZE
    );

    const promises = chunks.map(
      async chunk =>
        await dynamodbClient.transactWriteItems({
          TransactItems: chunk,
        })
    );

    await Promise.all(promises);
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
};

async function getInvitations() {
  const secondsSinceEpoch = Math.round(Date.now() / 1000);

  const loop = async (acc, exclusiveStartKey) => {
    const response = await dynamodbClient.query({
      TableName: INVITATION_TABLE,
      IndexName: 'byStatusByExpiration',
      KeyConditionExpression:
        '#status = :status AND #expiration <= :expiration',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#expiration': 'expiration',
      },
      ExpressionAttributeValues: {
        ':status': { S: InvitationTypes.INVITATION_STATUS.PENDING },
        ':expiration': { N: secondsSinceEpoch.toString() },
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
