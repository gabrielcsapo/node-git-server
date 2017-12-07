const path = require('path');

const Server = require('../');

const port = process.env.PORT || 7005;

const repos = new Server(path.normalize(path.resolve(__dirname, 'tmp')), {
    autoCreate: true,
    authenticate: (type, repo, user, next) => {
      console.log(type, repo); // eslint-disable-line
      if(type == 'push') {
        user((username, password) => {
          console.log(username, password); // eslint-disable-line
          next();
        });
      } else {
        next();
      }
    }
});

repos.on('push', (push) => {
    console.log(`push ${push.repo} / ${push.commit} ( ${push.branch} )`); // eslint-disable-line
    repos.list((err, result) => {
        console.log(result); // eslint-disable-line
    });
    push.accept();
});

repos.on('fetch', (fetch) => {
    console.log('username', fetch.username); // eslint-disable-line
    console.log('fetch ' + fetch.repo + '/' + fetch.commit); // eslint-disable-line
    fetch.accept();
});

repos.listen({ port: port, type: 'http' }, (error) => {
    if(error) return console.error(`failed to start git-server because of error ${error}`); // eslint-disable-line
    console.log(`node-git-server running at http://localhost:${port}`); // eslint-disable-line
    repos.list((err, result) => {
        if (!result) {
            console.log("No repositories available..."); // eslint-disable-line
        } else {
            console.log(result); // eslint-disable-line
        }
    });
});
