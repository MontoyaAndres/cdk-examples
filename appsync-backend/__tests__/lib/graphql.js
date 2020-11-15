const fetch = require('node-fetch');

const throwOnErrors = ({ query, variables, errors }) => {
  if (errors) {
    const errorMessage = `
query: ${query.substr(0, 100)}
  
variales: ${JSON.stringify(variables, null, 2)}
  
error: ${JSON.stringify(errors, null, 2)}
`;
    throw new Error(errorMessage);
  }
};

module.exports.GraphQL = async (url, query, variables = {}, auth) => {
  const headers = {};
  if (auth) {
    headers.Authorization = auth;
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await resp.json();

    const { data, errors } = json;
    throwOnErrors({ query, variables, errors });

    return data;
  } catch (error) {
    throwOnErrors({ query, variables, error });

    throw error;
  }
};
