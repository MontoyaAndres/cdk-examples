const COMPREHEND = require('aws-sdk/clients/comprehend');

const Response = require('../common/response');

const Comprehend = new COMPREHEND();

exports.handler = async event => {
  const body = JSON.parse(event.body);

  if (!body || !body.text) {
    return Response({ message: 'no text field on the body' }, 400);
  }

  const { text } = body;

  const params = {
    LanguageCode: 'en',
    TextList: [text],
  };

  try {
    const entityResults = await Comprehend.batchDetectEntities(
      params
    ).promise();
    const entities = entityResults.ResultList[0];

    const sentimentResults = await Comprehend.batchDetectSentiment(
      params
    ).promise();
    const sentiment = sentimentResults.ResultList[0];

    const responseData = {
      entities,
      sentiment,
    };
    console.log(responseData);

    return Response({ responseData });
  } catch (error) {
    console.log('error', error);
    return Response({ message: 'failed to work with comprehend' }, 400);
  }
};
