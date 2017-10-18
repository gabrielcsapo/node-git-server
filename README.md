# node-git-server

> A configurable git server written in Node.js

[![Npm Version](https://img.shields.io/npm/v/node-git-server.svg)](https://www.npmjs.com/package/node-git-server)
[![Build Status](https://travis-ci.org/gabrielcsapo/node-git-server.svg?branch=master)](https://travis-ci.org/gabrielcsapo/node-git-server)
[![Coverage Status](https://lcov-server.herokuapp.com/badge/github%2Ecom/gabrielcsapo/node-git-server.svg)](https://lcov-server.herokuapp.com/coverage/github%2Ecom/gabrielcsapo/node-git-server)
[![Dependency Status](https://david-dm.org/gabrielcsapo/node-git-server.svg)](https://david-dm.org/gabrielcsapo/node-git-server)
[![devDependency Status](https://david-dm.org/gabrielcsapo/node-git-server/dev-status.svg)](https://david-dm.org/gabrielcsapo/node-git-server#info=devDependencies)
[![npm](https://img.shields.io/npm/dt/node-git-server.svg)]()
[![npm](https://img.shields.io/npm/dm/node-git-server.svg)]()

# Install

```
npm install node-git-server
```

# Usage

```javascript
const Server = require('node-git-server');
const repo = new Server(path.resolve(__dirname, 'tmp'), {
    autoCreate: true,
    authenticate: (type, repo, username, password, next) => {
      console.log(type, repo, username, password);
      next();
    }
});
const port = process.env.PORT || 7005;

repos.on('push', (push) => {
    console.log('push ' + push.repo + '/' + push.commit
        + ' (' + push.branch + ')'
    );
    push.accept();
});

repos.on('fetch', (fetch) => {
    console.log('fetch ' + fetch.commit);
    fetch.accept();
});

repos.listen(port, () => {
    console.log(`node-git-server running at http://localhost:${port}`)
});
```

then start up the node-git-server server...

```
$ node example/index.js
```

meanwhile...

```
$ git push http://localhost:7005/beep master
Counting objects: 356, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (133/133), done.
Writing objects: 100% (356/356), 46.20 KiB, done.
Total 356 (delta 210), reused 355 (delta 210)
To http://localhost:7005/beep
 * [new branch]      master -> master
```

For more information please visit the [docs](http://www.gabrielcsapo.com/node-git-server/code/index.html)

# Philosophy   

This library is aimed to have a zero dependency footprint. If you are reading this and you see dependencies, help to remove them 🐒.

# Thanks

This is a hard fork from [pushover](https://github.com/substack/pushover).
