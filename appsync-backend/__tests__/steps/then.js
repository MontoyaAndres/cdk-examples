require('dotenv').config();
const fs = require('fs');
const AWS = require('aws-sdk');
const fetch = require('node-fetch');

const user_exists_in_UsersTable = async id => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient();

  console.log(`looking for user [${id}] in table [${process.env.USERS_TABLE}]`);
  const resp = await DynamoDB.get({
    TableName: process.env.USERS_TABLE,
    Key: {
      id,
    },
  }).promise();

  expect(resp.Item).toBeTruthy();

  return resp.Item;
};

const user_can_upload_image_to_url = async (url, filepath, contentType) => {
  const data = fs.readFileSync(filepath);

  await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: JSON.stringify(data),
  });

  console.log('uploaded image to', url);
};

const user_can_download_image_from = async url => {
  const resp = await fetch(url);

  console.log('downloaded image from', url);

  return resp;
};

module.exports = {
  user_exists_in_UsersTable,
  user_can_upload_image_to_url,
  user_can_download_image_from,
};
