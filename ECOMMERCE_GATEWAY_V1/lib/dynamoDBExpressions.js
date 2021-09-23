function DynamoDBExpressions(object) {
  let prefix = 'SET ';
  let params = {
    UpdateExpression: '',
    ExpressionAttributeValues: {},
    ExpressionAttributeNames: {},
  };

  for (const property in object) {
    if (property !== 'id') {
      params['UpdateExpression'] += prefix + '#' + property + ' = :' + property;
      params['ExpressionAttributeValues'][':' + property] = object[property];
      params['ExpressionAttributeNames']['#' + property] = property;
      prefix = ', ';
    }
  }

  return params;
}

module.exports = { DynamoDBExpressions };
