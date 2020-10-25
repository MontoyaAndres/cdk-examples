const S3 = require('aws-sdk/clients/s3');

const Response = require('../common/response');

const s3 = new S3();
const bucket = process.env.bucketName;

exports.handler = async event => {
  const { fileName } = event.pathParameters;

  if (!fileName) {
    return Response({ message: 'Missing fileName' }, 404);
  }

  let data = await s3
    .getObject({
      Bucket: bucket,
      Key: fileName,
    })
    .promise();

  if (!data) {
    throw Error('Failed to get file' + data);
  }

  if (fileName.slice(fileName.length - 4, fileName.length) == 'json') {
    data = data.Body.toString();
  }

  return Response({ data });
};
