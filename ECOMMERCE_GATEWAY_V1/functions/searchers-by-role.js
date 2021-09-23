const middy = require('@middy/core');
const ssm = require('@middy/ssm');

const {
  initUsersByRoleIndex,
  initInvitationsByRoleIndex,
} = require('../lib/algolia');
const { UserTypes, InvitationTypes } = require('../lib/constants');

const { STAGE } = process.env;

module.exports.handler = middy(async (event, context) => {
  const {
    arguments: { input },
  } = event;

  const resolvers = {
    Query: {
      usersByRole: async () => {
        const index = await initUsersByRoleIndex(
          context.ALGOLIA_APPLICATION_ID,
          context.ALGOLIA_API_KEY,
          STAGE
        );
        const response = await usersByRoleQuery(index, input);

        return response;
      },
      invitationsByRole: async () => {
        const index = await initInvitationsByRoleIndex(
          context.ALGOLIA_APPLICATION_ID,
          context.ALGOLIA_API_KEY,
          STAGE
        );
        const response = await invitationsByRoleQuery(index, input);

        return response;
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

async function usersByRoleQuery(index, input) {
  const {
    roleId,
    userStatus = UserTypes.USER_STATUS.APPROVED,
    search = '',
    page = 0,
    size = 100,
  } = input;

  try {
    const data = await index.search(search, {
      filters: `roleId:"${roleId}" AND status:"${userStatus}"`,
      page,
      hitsPerPage: size,
    });
    const users = data.hits?.map(hit => ({ ...hit, id: hit.userId }));

    return {
      data: users,
      page: data.page,
      size: data.hitsPerPage,
      totalElements: data.nbHits,
      totalPages: data.nbPages,
    };
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}

async function invitationsByRoleQuery(index, input) {
  const { roleId, page = 0, size = 100 } = input;

  try {
    const data = await index.search('', {
      filters: `(status:"${InvitationTypes.INVITATION_STATUS.PENDING}" OR status:"${InvitationTypes.INVITATION_STATUS.REJECTED}") AND roleId:"${roleId}"`,
      page,
      hitsPerPage: size,
    });
    const invitations = data.hits?.map(hit => ({
      ...hit,
      id: hit.objectID,
      // The dates are sent in GMT time
      expirationDate: new Date(hit.expiration * 1000).toISOString(),
      date: hit.createdAt,
    }));

    return {
      data: invitations,
      page: data.page,
      size: data.hitsPerPage,
      totalElements: data.nbHits,
      totalPages: data.nbPages,
    };
  } catch (error) {
    console.error(error);

    throw new Error(error);
  }
}
