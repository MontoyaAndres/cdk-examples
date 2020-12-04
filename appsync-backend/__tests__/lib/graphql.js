const fetch = require('node-fetch');

const fragments = {};
const registerFragment = (name, fragment) => (fragments[name] = fragment);

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

function* findUsedFragments(query, usedFragments = new Set()) {
  for (const name of Object.keys(fragments)) {
    if (query.includes(name) && !usedFragments.has(name)) {
      usedFragments.add(name);
      yield name;

      const fragment = fragments[name];
      const nestedFragments = findUsedFragments(fragment, usedFragments);

      for (const nestedName of Array.from(nestedFragments)) {
        yield nestedName;
      }
    }
  }
}

module.exports.registerFragment = registerFragment;
module.exports.GraphQL = async (url, query, variables = {}, auth) => {
  const headers = {};
  if (auth) {
    headers.Authorization = auth;
  }

  const usedFragments = Array.from(findUsedFragments(query)).map(
    name => fragments[name]
  );

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: [query, ...usedFragments].join('\n'),
        variables,
      }),
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
