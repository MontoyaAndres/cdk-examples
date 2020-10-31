const SES = require('aws-sdk/clients/ses');

const Response = require('../common/response');

const ses = new SES();

exports.handler = async event => {
  const { to, from, subject, text } = JSON.parse(event.body);

  if (!to || !from || !subject || !text) {
    return Response(
      {
        message: 'to, from, subject and text are all required in the body',
      },
      400
    );
  }

  const params = {
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Body: {
        Text: { Data: text },
      },
      Subject: { Data: subject },
    },
    Source: from,
  };

  try {
    await ses.sendEmail(params).promise();
    return Response({});
  } catch (error) {
    console.log(error);
    return Response({ message: 'The email failed to send' }, 400);
  }
};
