const path = require('path');

const Server = require('../');

const port = process.env.PORT || 7005;

const git = new Server(path.resolve(__dirname, 'tmp'), {
    autoCreate: true,
    repos: {
        'test': {
            password: 'root',
            username: 'root'
        }
    }
});

git.on('push', (push) => {
    console.log(`push ${push.repo} / ${push.commit} ( ${push.branch} )`); // eslint-disable-line
    git.list((err, result) => {
        console.log(result); // eslint-disable-line
    });
    push.accept();
});

git.on('fetch', (fetch) => {
    console.log('fetch ' + fetch.repo + '/' + fetch.commit); // eslint-disable-line
    fetch.accept();
});

git.listen(port, (error) => {
    if(error) return console.error(`failed to start git-server because of error ${error}`); // eslint-disable-line
    console.log(`node-git-server running at http://localhost:${port}`); // eslint-disable-line
    git.list((err, result) => {
        console.log(result); // eslint-disable-line
    });
});
