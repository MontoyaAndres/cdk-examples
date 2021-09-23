const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require('@aws-sdk/util-dynamodb');
const { SES } = require('@aws-sdk/client-ses');
const ulid = require('ulid');
const graphql = require('graphql-tag');

const {
  NotificationTypes,
  NotificationActions,
  InvitationTypes,
} = require('../lib/constants');
const { mutate } = require('../lib/graphql');
const { EmailMessages } = require('../lib/email-messages');

const { ACCOUNT_TABLE, ROLE_TABLE, USER_TABLE, SES_EMAIL } = process.env;

const dynamodbClient = new DynamoDB();
const sesClient = new SES({
  region: 'us-west-2',
});

module.exports.handler = async event => {
  await Promise.all(
    event.Records.map(async record => {
      if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
        const values = unmarshall(record.dynamodb.NewImage);

        let currentAction;

        if (values.status === InvitationTypes.INVITATION_STATUS.PENDING) {
          currentAction = NotificationActions.REQUEST;
        }

        if (values.status === InvitationTypes.INVITATION_STATUS.APPROVED) {
          currentAction = NotificationActions.APPROVED;
        }

        if (values.status === InvitationTypes.INVITATION_STATUS.REJECTED) {
          currentAction = NotificationActions.REJECTED;
        }

        if (values.status === InvitationTypes.INVITATION_STATUS.DELETED) {
          // It's no necessary to notify about this invitation status
          return;
        }

        if (!currentAction) {
          throw new Error('Action not assigned');
        }

        try {
          if (record.eventName === 'INSERT') {
            await notifyInvitationInsert(values, currentAction);
          }

          if (record.eventName === 'MODIFY') {
            await notifyInvitationModify(values, currentAction);
          }
        } catch (error) {
          console.error(error);

          throw new Error(error);
        }
      }
    })
  );
};

async function notifyInvitationInsert(values, currentAction) {
  const { id, roleId, ownerId, guestId, accountId, email } = values;

  if (currentAction !== NotificationActions.REQUEST) {
    return;
  }

  const currentAccount = await dynamodbClient.getItem({
    TableName: ACCOUNT_TABLE,
    Key: { id: { S: accountId } },
    ProjectionExpression: '#name, picture',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
  });

  if (!currentAccount.Item) {
    throw new Error('Account not found');
  }

  const currentRole = await dynamodbClient.getItem({
    TableName: ROLE_TABLE,
    Key: { id: { S: roleId }, accountId: { S: accountId } },
    ProjectionExpression: '#name',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
  });

  if (!currentRole.Item) {
    throw new Error('Role not found');
  }

  const currentOwner = await dynamodbClient.getItem({
    TableName: USER_TABLE,
    Key: { id: { S: ownerId } },
    ProjectionExpression: '#name',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
  });

  if (!currentOwner.Item) {
    throw new Error('Owner not found');
  }

  await sesClient.sendEmail({
    Destination: {
      ToAddresses: [email],
    },
    Message: EmailMessages.INVITATION_EMAIL_MESSAGE({
      UserName: currentOwner.Item.name.S,
      InvitationId: id,
      AccountName: currentAccount.Item.name.S,
      RolName: currentRole.Item.name.S,
    }),
    Source: SES_EMAIL,
  });

  if (!guestId) return;

  let input = {
    id: ulid.ulid(),
    userId: guestId,
    type: NotificationTypes.INVITATION,
    action: currentAction,
    title: `${currentAccount.Item.name.S} te ha invitado a unirte como ${currentRole.Item.name.S}`,
    description: `${currentOwner.Item.name.S} te ha invitado a ser parte de su equipo.`,
    picture: currentAccount.Item.picture.S,
  };

  await mutate(
    graphql`
      mutation notifyEvent($input: NotifyEvent) {
        notifyEvent(input: $input) {
          id
          userId
          type
          action
          title
          description
          picture
          additionalInfo
        }
      }
    `,
    { input }
  );
}

async function notifyInvitationModify(values, currentAction) {
  const { roleId, ownerId, guestId, accountId } = values;

  if (
    currentAction !== NotificationActions.APPROVED &&
    currentAction !== NotificationActions.REJECTED
  ) {
    return;
  }

  const currentAccount = await dynamodbClient.getItem({
    TableName: ACCOUNT_TABLE,
    Key: { id: { S: accountId } },
    ProjectionExpression: '#name, picture',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
  });

  if (!currentAccount.Item) {
    throw new Error('Account not found');
  }

  const currentRole = await dynamodbClient.getItem({
    TableName: ROLE_TABLE,
    Key: { id: { S: roleId }, accountId: { S: accountId } },
    ProjectionExpression: '#name',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
  });

  if (!currentRole.Item) {
    throw new Error('Role not found');
  }

  const currentGuest = await dynamodbClient.getItem({
    TableName: USER_TABLE,
    Key: { id: { S: guestId } },
    ProjectionExpression: '#name',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
  });

  if (!currentGuest.Item) {
    throw new Error('Guest not found');
  }

  let input = {
    id: ulid.ulid(),
    userId: ownerId,
    type: NotificationTypes.INVITATION,
    action: currentAction,
    title: `${currentGuest.Item.name.S} ha ${
      currentAction === NotificationActions.APPROVED ? 'aprovado' : 'rechazado'
    } la solicitud a unirse a ${currentAccount.Item.name.S}`,
    description: `${currentGuest.Item.name.S} ${
      currentAction === NotificationActions.APPROVED
        ? 'hace parte'
        : 'no hace parte'
    } del rol ${currentRole.Item.name.S}`,
    picture: currentAccount.Item.picture.S,
  };

  await mutate(
    graphql`
      mutation notifyEvent($input: NotifyEvent) {
        notifyEvent(input: $input) {
          id
          userId
          type
          action
          title
          description
          picture
          additionalInfo
        }
      }
    `,
    { input }
  );
}
