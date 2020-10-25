const S3 = require('aws-sdk/clients/s3');

const Response = require('../common/response');

const s3 = new S3();
const bucket = process.env.bucketName;

exports.handler = async event => {
  const { fileName } = event.pathParameters;
  const data = JSON.parse(event.body);

  if (!fileName) {
    return Response({ message: 'Missing fileName' }, 404);
  }

  if (Object.keys(data).length === 0) {
    return Response({ message: 'Not arguments found' }, 404);
  }

  const newFile = await s3
    .putObject({
      Bucket: bucket,
      Body: JSON.stringify(data),
      Key: fileName,
    })
    .promise();

  if (!newFile) {
    throw Error('Something went wrong creating the file' + newFile);
  }

  return Response({ newFile });
};
