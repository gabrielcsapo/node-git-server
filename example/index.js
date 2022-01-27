// You Can Use The Commands Below To Generate A Self Signed Certificate For Use With This Tutorial
// These Commands Require That You have 'openssl' installed on your system
// openssl genrsa -out privatekey.pem 1024
// openssl req -new -key privatekey.pem -out certrequest.csr
// openssl x509 -req -in certrequest.csr -signkey privatekey.pem -out certificate.pem

let type = 'http';

process.argv.slice(2).forEach((arg) => {
  switch (arg) {
    case 'https':
    case '--https':
      type = 'https';
      break;
  }
});

const fs = require('fs');
const path = require('path');

const { Git : Server } = require("../");

const port = process.env.PORT || 7005;

const repos = new Server(path.normalize(path.resolve(__dirname, 'tmp')), {
  autoCreate: true,
  authenticate: async ({ type, repo, getUser, headers }) => {
    console.log(type, repo, headers); // eslint-disable-line
    if (type == 'push') {
      const [username, password] = await getUser();
      // Decide if this user is allowed to perform this action against this repo.
      if (username === '42' && password === '42') {
        // This return value can be whatever you want - it is accessible from events.
        return {
          protectedBranches: ["docs", "main"],
        };
      } else {
        throw Error('wrong password');
      }
    }
  },
});

repos.on('push', (push) => {
    console.log(`push ${push.repo} / ${push.commit} ( ${push.branch} )`); // eslint-disable-line

  repos.list((err, results) => {
    push.log(' ');
    push.log('Hey!');
    push.log('Checkout these other repos:');
    for (const repo of results) {
      push.log(`- ${repo}`);
    }
    push.log(' ');
  });

  if (push.context.protectedBranches.indexOf(push.branch) !== -1) {
    push.log('You do not have permission to write to this branch');
    push.reject();
  } else {
    push.accept();
  }
});

repos.on('fetch', (fetch) => {
    console.log(`username ${fetch.username}`); // eslint-disable-line
    console.log(`fetch ${fetch.repo}/${fetch.commit}`); // eslint-disable-line
  fetch.accept();
});

repos.listen(
  port,
  {
    type,
    key: fs.readFileSync(path.resolve(__dirname, 'privatekey.pem')),
    cert: fs.readFileSync(path.resolve(__dirname, 'certificate.pem')),
  },
  (error) => {
    if(error) return console.error(`failed to start git-server because of error ${error}`); // eslint-disable-line
    console.log(`node-git-server running at ${type}://localhost:${port}`); // eslint-disable-line
    repos.list((err, result) => {
      if (!result) {
            console.log("No repositories available..."); // eslint-disable-line
      } else {
            console.log(result); // eslint-disable-line
      }
    });
  }
);
