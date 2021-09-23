const MenuTypes = {
  MENU: 'Menu',
};

const UserTypes = {
  USER: 'User',
  USER_STATUS: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    BLOCKED: 'BLOCKED',
  },
};

const RoleTypes = {
  ROLE: 'Role',
};

const InvitationTypes = {
  INVITATION: 'Invitation',
  INVITATION_STATUS: {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    DELETED: 'DELETED',
  },
};

const NotificationTypes = {
  INVITATION: 'INVITATION',
};

const NotificationActions = {
  REQUEST: 'REQUEST',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

const DynamoDBMaxBatchSize = {
  MAX_BATCH_SIZE: 25,
};

module.exports = {
  MenuTypes,
  UserTypes,
  RoleTypes,
  InvitationTypes,
  NotificationTypes,
  NotificationActions,
  DynamoDBMaxBatchSize,
};
