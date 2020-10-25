const Response = require('../common/response');

exports.handler = async event => {
  const id = event.pathParameters.id;

  if (!id) {
    return Response({ message: 'Missing id' }, 404);
  }

  return Response({ message: 'Found!' });
};
