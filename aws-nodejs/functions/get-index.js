'use strict';

const fs = require('fs');

let html;

const getHtml = () => {
  return new Promise((resolve, reject) => {
    if (html) {
      resolve(html);
      return;
    }

    fs.readFile(`${__dirname}/../public/index.html`, (err, content) => {
      if (err) {
        reject(err);
        return;
      }

      html = Buffer.from(content).toString();

      resolve(html);
    });
  });
};

module.exports.handler = async () => {
  const html = await getHtml();
  console.log(html);

  return {
    statusCode: 200,
    body: html,
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
    },
  };
};
