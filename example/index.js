const path = require('path');

const gitserver = require('../');
const repos = gitserver(path.resolve(__dirname, 'tmp'), { autoCreate : true });
const port = process.env.PORT || 7005;

repos.on('push', (push) => {
    console.log(`push ${push.repo} / ${push.commit} ( ${push.branch} )`); // eslint-disable-line
    push.accept();
});

repos.on('fetch', (fetch) => {
    console.log('fetch ' + fetch.repo + '/' + fetch.commit); // eslint-disable-line
    fetch.accept();
});

repos.listen(port, () => {
    console.log(`node-git-server running at http://localhost:${port}`); // eslint-disable-line
    setInterval(() => {
      repos.list((err, result) => {
          console.log(result); // eslint-disable-line
      });
    }, 1000);
});
