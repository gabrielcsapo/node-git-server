# Introduction

## Install

```
npm install node-git-server
```

## Usage

### Simple

```typescript
import { Git } from 'node-git-server';
import { join } from 'path';

const port =
  !process.env.PORT || isNaN(process.env.PORT)
    ? 7005
    : parseInt(process.env.PORT);

const repos = new Git(join(__dirname, '../repo'), {
  autoCreate: true,
});

repos.on('push', (push) => {
  console.log(`push ${push.repo}/${push.commit} ( ${push.branch} )`);
  push.accept();
});

repos.on('fetch', (fetch) => {
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

### Sending logs

```typescript
import { Git } from 'node-git-server';
import { join } from 'path';

const port =
  !process.env.PORT || isNaN(process.env.PORT)
    ? 7005
    : parseInt(process.env.PORT);

const repos = new Git(join(__dirname, '../repo'), {
  autoCreate: true,
});

repos.on('push', async (push) => {
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

repos.on('fetch', (fetch) => {
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

#### Authentication

Every request runs through the `authenticate` callback given to the `Git` constructor.

This callback is passed fairly generic information, and should throw an error if the
user given credentials are invalid.

`authenticate` can return a `context` object which the more specific event listeners
(such as `'push'`) can use to perform fine-grained authorization checks.

```typescript
import { Git } from 'node-git-server';
import { join } from 'path';

const port =
  !process.env.PORT || isNaN(process.env.PORT)
    ? 7005
    : parseInt(process.env.PORT);

interface MyRequestContext {
  userInfo: MyUserInfo;
}

const repos = new Git<MyRequestContext>(join(__dirname, '../repo'), {
  autoCreate: true,
  authenticate: async ({ type, getUser }): Promise<MyRequestContext> => {
    const [username, password] = await getUser();
    // Check these use credentials in your own system
    const info = await getUsersInfo(username, password);
    if (!info) throw new Error("username or password incorrect");
    return {
      userInfo: info,
    };
  }
});

repos.on('push', (push) => {
  console.log(`push ${push.repo}/${push.commit} ( ${push.branch} )`);
  if (push.context?.userInfo.canPushToBranch(push.branch))
    push.accept();
  else
    push.reject();
});

repos.on('fetch', (fetch) => {
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

## Example

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
