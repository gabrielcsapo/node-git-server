# node-git-server

An almost zero dependency git-server built with `nodejs`

[![Npm Version](https://img.shields.io/npm/v/node-git-server.svg)](https://www.npmjs.com/package/node-git-server)
[![Build Status](https://travis-ci.org/gabrielcsapo/node-git-server.svg?branch=master)](https://travis-ci.org/gabrielcsapo/node-git-server)
[![Coverage Status](https://coveralls.io/repos/github/gabrielcsapo/node-git-server/badge.svg?branch=master)](https://coveralls.io/github/gabrielcsapo/node-git-server?branch=master)
[![Dependency Status](https://david-dm.org/gabrielcsapo/node-git-server.svg)](https://david-dm.org/gabrielcsapo/node-git-server)
[![devDependency Status](https://david-dm.org/gabrielcsapo/node-git-server/dev-status.svg)](https://david-dm.org/gabrielcsapo/node-git-server#info=devDependencies)
[![npm](https://img.shields.io/npm/dt/node-git-server.svg)]()
[![npm](https://img.shields.io/npm/dm/node-git-server.svg)]()

This library makes it super easy to set up custom git push deploy logic.

# requirements

```
- git (^ 2.7)
```

# install

```
npm install node-git-server
```

# example

```javascript
var gitserver = require('node-git-server');
var repos = gitserver('/tmp/repos');
var port = process.env.PORT || 7005;

repos.on('push', function (push) {
    console.log('push ' + push.repo + '/' + push.commit
        + ' (' + push.branch + ')'
    );
    push.accept();
});

repos.on('fetch', function (fetch) {
    console.log('fetch ' + fetch.commit);
    fetch.accept();
});

repos.listen(port, function() {
    console.log(`node-git-server running at http://localhost:${port}`)
});
```

then start up the node-git-server server...

```
$ node example/index.js
```

meanwhile...

```
$ git push http://localhost:7000/beep master
Counting objects: 356, done.
Delta compression using up to 2 threads.
Compressing objects: 100% (133/133), done.
Writing objects: 100% (356/356), 46.20 KiB, done.
Total 356 (delta 210), reused 355 (delta 210)
To http://localhost:7000/beep
 * [new branch]      master -> master
```

and then...

```
$ node example/simple.js
push beep.git/d5013a53a0e139804e729a12107fc212f11e64c3 (master)
```

or...

```
$ git clone http://localhost:7000/beep.git
```

and then...

```
fetch beep.git/d5013a53a0e139804e729a12107fc212f11e64c3
```

# methods

var gitserver = require('node-git-server')

## var repos = node-git-server(repoDir, opts={autoCreate:true})

Create a new repository collection from the directory `repoDir`.
`repoDir` should be entirely empty except for git repo directories.

If `repoDir` is a function, `repoDir(repo)` will be used to dynamically resolve
project directories. The return value of `repoDir(repo)` should be a string path
specifying where to put the string `repo`. Make sure to return the same value
for `repo` every time since `repoDir(repo)` will be called multiple times.

The return value, `repos` is an EventEmitter that emits the events listed below
in the events section.

By default, repository targets will be created if they don't exist. You can
disable that behavior with `opts.autoCreate`.

If `opts.checkout` is true, create and expected checked-out repos instead of
bare repos.

## repos.handle(req, res)

Handle incoming HTTP requests with a connect-style middleware.

Everything is admin-party by default.
Check the credentials further up the stack using basic auth or whatevs.

## repos.create(repoName, cb)

Create a new bare repository `repoName` in the instance repository directory.

Optionally get a callback `cb(err)` to be notified when the repository was
created.

## repos.mkdir(dir, cb)

Create a subdirectory `dir` in the repo dir with an errback `cb(err)`.

## repos.list(cb)

Get a list of all the repositories in the callback `cb(err, repos)`.

## repos.exists(repoName, cb)

Find out whether `repoName` exists in the callback `cb(exists)`.

# events

## repos.on('push', function (push) { ... }

Emitted when somebody does a `git push` to the repo.

Exactly one listener must call `push.accept()` or `push.reject()`. If there are
no listeners, `push.accept()` is called automatically.

`push` is an http duplex object (see below) with these extra properties:

* push.repo
* push.commit
* push.branch

## repos.on('tag', function (tag) { ... }

Emitted when somebody does a `git push --tags` to the repo.

Exactly one listener must call `tag.accept()` or `tag.reject()`. If there are
no listeners, `tag.accept()` is called automatically.

`tag` is an http duplex object (see below) with these extra properties:

* tag.repo
* tag.commit
* tag.version

## repos.on('fetch', function (fetch) { ... }

Emitted when somebody does a `git fetch` to the repo (which happens whenever you
do a `git pull` or a `git clone`).

Exactly one listener must call `fetch.accept()` or `fetch.reject()`. If there are
no listeners, `fetch.accept()` is called automatically.

`fetch` is an http duplex objects (see below) with these extra properties:

* fetch.repo
* fetch.commit

## repos.on('info', function (info) { ... }

Emitted when the repo is queried for info before doing other commands.

Exactly one listener must call `info.accept()` or `info.reject()`. If there are
no listeners, `info.accept()` is called automatically.

`info` is an http duplex object (see below) with these extra properties:

* info.repo

## repos.on('head', function (head) { ... }

Emitted when the repo is queried for HEAD before doing other commands.

Exactly one listener must call `head.accept()` or `head.reject()`. If there are
no listeners, `head.accept()` is called automatically.

`head` is an http duplex object (see below) with these extra properties:

* head.repo

## push.on('response', function(response, done) { ... })

Emitted when node-git-server creates a resposne stream that will be sent to the git client on the other end.

This should really only be used if you want to send verbose or error messages to the remote git client.

`response` is a writable stream that can accept buffers containing git packfile sidechannel transfer protocol encoded strings. `done` is a callback that must be called when you want to end the response.

If you create a response listener then you must either call the `done` function or execute the following end sequence when you want to end the response:

```js
response.queue(new Buffer('0000'))
response.queue(null)
```

If you never use the response event then the above data will be sent by default. Binding a listener to the response event will prevent the end sequence those from being sent, so you must send them yourself after sending any other messages.

# http duplex objects

The arguments to each of the events `'push'`, `'fetch'`, `'info'`, and `'head'`
are [http duplex](http://github.com/gabrielcsapo/http-duplex) that act as both http
server request and http server response objects so you can pipe to and from them.

For every event if there are no listeners `dup.accept()` will be called
automatically.

## dup.accept()

Accept the pending request.

## dup.reject()

Reject the pending request.

# TODO

- [ ] add user authentication mechanism
- [ ] remove dependency on http-duplex
- [ ] remove dependency on through
- [ ] add jsdoc

# Philosophy   

This library is aimed to have a zero dependency footprint. If you are reading this and you see dependencies, help to remove them 🐒.

# thanks

This is a hard fork from [pushover](https://github.com/substack/pushover).

# license

MIT
