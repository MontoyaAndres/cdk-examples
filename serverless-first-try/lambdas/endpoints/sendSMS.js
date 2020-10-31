const SNS = require('aws-sdk/clients/sns');

const Response = require('../common/response');

const sns = new SNS();

exports.handler = async event => {
  const body = JSON.parse(event.body);

  if (!body || !body.phoneNumber || !body.message) {
    return Response(
      { message: 'missing phone number or messsage from the body' },
      400
    );
  }

  const AttributeParams = {
    attributes: {
      DefaultSMSType: 'Promotional',
    },
  };

  const messageParams = {
    Message: body.message,
    PhoneNumber: body.phoneNumber,
  };

  try {
    await sns.setSMSAttributes(AttributeParams).promise();
    await sns.publish(messageParams).promise();

    return Response({ message: 'text has been sent' });
  } catch (error) {
    return Response({ message: 'text failed to send' }, 400);
  }
};
