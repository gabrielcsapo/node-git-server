# node-git-server

> 🎡 A configurable git server written in Node.js

[![Npm Version](https://img.shields.io/npm/v/node-git-server.svg)](https://www.npmjs.com/package/node-git-server)
[![Build Status](https://travis-ci.org/gabrielcsapo/node-git-server.svg?branch=master)](https://travis-ci.org/gabrielcsapo/node-git-server)
[![Coverage Status](https://lcov-server.gabrielcsapo.com/badge/github%2Ecom/gabrielcsapo/node-git-server.svg)](https://lcov-server.gabrielcsapo.com/coverage/github%2Ecom/gabrielcsapo/node-git-server)
[![Dependency Status](https://starbuck.gabrielcsapo.com/badge/github/gabrielcsapo/node-git-server/status.svg)](https://starbuck.gabrielcsapo.com/github/gabrielcsapo/node-git-server)
[![devDependency Status](https://starbuck.gabrielcsapo.com/badge/github/gabrielcsapo/node-git-server/dev-status.svg)](https://starbuck.gabrielcsapo.com/github/gabrielcsapo/node-git-server#info=devDependencies)
[![npm](https://img.shields.io/npm/dt/node-git-server.svg)]()
[![npm](https://img.shields.io/npm/dm/node-git-server.svg)]()

# Install

```
npm install node-git-server
```

# Usage

## Simple

```typescript
import { Git } from 'node-git-server';
import { join } from 'path;

const port = !process.env.PORT || isNaN(process.env.PORT)
  ? 7005
  : parseInt(process.env.PORT);

const repos = new Git(
  join(__dirname, '../repo'),
  {
    autoCreate: true,
  }
);

repos.on('push', push => {
  console.log(`push ${push.repo}/${push.commit} ( ${push.branch} )`);
  push.accept();
});

repos.on("fetch", fetch => {
  console.log(`fetch ${fetch.commit}`);
  fetch.accept();
});

repos.listen(port, () => {
  console.log(`node-git-server running at http://localhost:${port}`);
});
```

then start up the node-git-server server...

```
$ node example/index.js
node-git-server running at http://localhost:7005
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

## Sending logs

```typescript
import { Git } from 'node-git-server';
import { join } from 'path;

const port = !process.env.PORT || isNaN(process.env.PORT)
  ? 7005
  : parseInt(process.env.PORT);

const repos = new Git(
  join(__dirname, '../repo'),
  {
    autoCreate: true,
  }
);

repos.on('push', async push => {
  console.log(`push ${push.repo}/${push.commit} ( ${push.branch} )`);

  push.log();
  push.log('Hey!');
  push.log('Checkout these other repos:');
  for (const repo of await repo.list()) {
    push.log(`- ${repo}`);
  }
  push.log();
  push.accept();
});

repos.on("fetch", fetch => {
  console.log(`fetch ${fetch.commit}`);
  fetch.accept();
});

repos.listen(port, () => {
  console.log(`node-git-server running at http://localhost:${port}`);
});
```

then start up the node-git-server server...

```
$ node example/index.js
node-git-server running at http://localhost:7005
```

meanwhile...

```
$ git push http://localhost:7005/beep master
Counting objects: 356, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (133/133), done.
Writing objects: 100% (356/356), 46.20 KiB, done.
Total 356 (delta 210), reused 355 (delta 210)
remote:
remote: Hey!
remote: Checkout these other repos:
remote: - test.git
remote:
To http://localhost:7005/test
   77bb26e..22918d5  master -> master
```

### Authentication

```typescript
import { Git } from 'node-git-server';
import { join } from 'path;

const port = !process.env.PORT || isNaN(process.env.PORT)
  ? 7005
  : parseInt(process.env.PORT);

const repos = new Git(
  join(__dirname, '../repo'),
  {
    autoCreate: true,
    autheficate: ({ type, user }, next) =>
      type == 'push'
      ? user(([username, password]) => {
        console.log(username, password);
        next();
      })
      : next()
  }
);

repos.on('push', push => {
  console.log(`push ${push.repo}/${push.commit} ( ${push.branch} )`);
  push.accept();
});

repos.on("fetch", fetch => {
  console.log(`fetch ${fetch.commit}`);
  fetch.accept();
});

repos.listen(port, () => {
  console.log(`node-git-server running at http://localhost:${port}`);
});
```

then start up the node-git-server server...

```
$ node example/index.js
node-git-server running at http://localhost:7005
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

# Example

Running the following command will start up a simple http server:

```
node example/index.js
```

If you want to try using https run the following

```
node example/index.js --https
```

> When running https with self-signed certs there are two ways to override the git-clients behavior using `git config http.sslVerify false` or `git config --global http.sslCAInfo /path/to/cert.pem`

For more information please visit the [docs](http://www.gabrielcsapo.com/node-git-server/code/index.html)

# Philosophy

This library is aimed to have a zero dependency footprint. If you are reading this and you see dependencies, help to remove them 🐒.

# Thanks

This is a hard fork from [pushover](https://github.com/substack/pushover).
