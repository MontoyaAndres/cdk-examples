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

const tweet_exists_in_TweetsTable = async id => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient();

  console.log(
    `looking for tweet [${id}] in table [${process.env.TWEETS_TABLE}]`
  );
  const resp = await DynamoDB.get({
    TableName: process.env.TWEETS_TABLE,
    Key: {
      id,
    },
  }).promise();

  expect(resp.Item).toBeTruthy();

  return resp.Item;
};

const retweet_exists_in_TweetsTable = async (userId, tweetId) => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient();

  console.log(
    `looking for retweet of [${tweetId}] in table [${process.env.TWEETS_TABLE}]`
  );

  const resp = await DynamoDB.query({
    TableName: process.env.TWEETS_TABLE,
    IndexName: 'retweetsByCreator',
    KeyConditionExpression: 'creator = :creator AND retweetOf = :tweetId',
    ExpressionAttributeValues: {
      ':creator': userId,
      ':tweetId': tweetId,
    },
    Limit: 1,
  }).promise();

  const retweet = resp.Items[0];

  expect(retweet).toBeTruthy();

  return retweet;
};

const retweet_does_not_exist_in_TweetsTable = async (userId, tweetId) => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient();

  console.log(
    `looking for retweet of [${tweetId}] in table [${process.env.TWEETS_TABLE}]`
  );

  const resp = await DynamoDB.query({
    TableName: process.env.TWEETS_TABLE,
    IndexName: 'retweetsByCreator',
    KeyConditionExpression: 'creator = :creator AND retweetOf = :tweetId',
    ExpressionAttributeValues: {
      ':creator': userId,
      ':tweetId': tweetId,
    },
    Limit: 1,
  }).promise();

  expect(resp.Items).toHaveLength(0);

  return null;
};

const retweet_exists_in_RetweetsTable = async (userId, tweetId) => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient();

  console.log(
    `looking for retweet of [${tweetId}] for user [${userId}] in table [${process.env.RETWEETS_TABLE}]`
  );

  const resp = await DynamoDB.get({
    TableName: process.env.RETWEETS_TABLE,
    Key: {
      userId,
      tweetId,
    },
  }).promise();

  expect(resp.Item).toBeTruthy();

  return resp.Item;
};

const retweet_does_not_exist_in_RetweetsTable = async (userId, tweetId) => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient();

  console.log(
    `looking for retweet of [${tweetId}] for user [${userId}] in table [${process.env.RETWEETS_TABLE}]`
  );

  const resp = await DynamoDB.get({
    TableName: process.env.RETWEETS_TABLE,
    Key: {
      userId,
      tweetId,
    },
  }).promise();

  expect(resp.Item).not.toBeTruthy();

  return resp.Item;
};

const tweet_exists_in_TimelinesTable = async (userId, tweetId) => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient();

  console.log(
    `looking for tweet [${tweetId}] for user [${userId}] in table [${process.env.TIMELINES_TABLE}]`
  );
  const resp = await DynamoDB.get({
    TableName: process.env.TIMELINES_TABLE,
    Key: {
      userId,
      tweetId,
    },
  }).promise();

  expect(resp.Item).toBeTruthy();

  return resp.Item;
};

const there_are_N_tweets_in_TimelinesTable = async (userId, n) => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient();

  console.log(
    `looking for [${n}] tweets for user [${userId}] in table [${process.env.TIMELINES_TABLE}]`
  );

  const resp = await DynamoDB.query({
    TableName: process.env.TIMELINES_TABLE,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
    ScanIndexForward: false,
  }).promise();

  expect(resp.Items).toHaveLength(n);

  return resp.Items;
};

const tweetsCount_is_updated_in_UsersTable = async (id, newCount) => {
  const DynamoDB = new AWS.DynamoDB.DocumentClient();

  console.log(`looking for user [${id}] in table [${process.env.USERS_TABLE}]`);
  const resp = await DynamoDB.get({
    TableName: process.env.USERS_TABLE,
    Key: {
      id,
    },
  }).promise();

  expect(resp.Item).toBeTruthy();
  expect(resp.Item.tweetsCount).toEqual(newCount);

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
  tweet_exists_in_TweetsTable,
  tweet_exists_in_TimelinesTable,
  tweetsCount_is_updated_in_UsersTable,
  retweet_exists_in_TweetsTable,
  retweet_does_not_exist_in_TweetsTable,
  retweet_exists_in_RetweetsTable,
  retweet_does_not_exist_in_RetweetsTable,
  there_are_N_tweets_in_TimelinesTable,
};
