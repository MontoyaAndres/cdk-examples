const algoliasearch = require('algoliasearch');

let usersByRoleIndex, invitationsByRoleIndex;

const initUsersByRoleIndex = async (appId, key, stage) => {
  if (!usersByRoleIndex) {
    const client = algoliasearch(appId, key);
    usersByRoleIndex = client.initIndex(`appsync_users_by_role_${stage}`);
  }

  return usersByRoleIndex;
};

const initInvitationsByRoleIndex = async (appId, key, stage) => {
  if (!invitationsByRoleIndex) {
    const client = algoliasearch(appId, key);
    invitationsByRoleIndex = client.initIndex(
      `appsync_invitations_by_role_${stage}`
    );
  }

  return invitationsByRoleIndex;
};

module.exports = {
  initUsersByRoleIndex,
  initInvitationsByRoleIndex,
};
