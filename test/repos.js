var test = require('tape');
var gitserver = require('../');

var fs = require('fs');
var path = require('path');
var exists = fs.exists || path.exists;

var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var http = require('http');

var async = require('async');

test('create, push to, and clone a repo', function (t) {
    t.plan(28);

    var repoDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var srcDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var dstDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var lastCommit;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    var repos = gitserver(repoDir, { autoCreate : true });
    var port = Math.floor(Math.random() * ((1<<16) - 1e4)) + 1e4;
    var server = http.createServer(function (req, res) {
        repos.handle(req, res);
    });
    server.listen(port);

    process.chdir(srcDir);
    async.waterfall([
        function (callback) {
            repos.create('doom', function() {
                callback();
            })
        },
        function (callback) {
            spawn('git', [ 'init' ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            fs.writeFile(srcDir + '/a.txt', 'abcd', function(err) {
                t.ok(!err, 'no error on write');
                callback();
            });
        },
        function (callback) {
            spawn('git', [ 'add', 'a.txt' ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            spawn('git', [ 'commit', '-am', 'a!!' ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            spawn('git', ['tag', '0.0.1'])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            fs.writeFile(srcDir + '/a.txt', 'efgh', function(err) {
                t.ok(!err, 'no error on write');
                callback();
            });
        },
        function (callback) {
            spawn('git', [ 'add', 'a.txt' ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            spawn('git', [ 'commit', '-am', 'a!!' ])
            .on('exit', function () {
                exec('git log | head -n1', function (err, stdout) {
                    lastCommit = stdout.split(/\s+/)[1];
                    callback();
                });
            });
        },
        function (callback) {
            spawn('git', ['tag', '0.0.2'])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            spawn('git', [
                'push', '--tags', 'http://localhost:' + port + '/doom', 'master'
            ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            process.chdir(dstDir);
            spawn('git', [ 'clone', 'http://localhost:' + port + '/doom' ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            exists(dstDir + '/doom/a.txt', function (ex) {
                t.ok(ex, 'a.txt exists');
                callback();
            })
        }
    ], function(err) {
        t.ok(!err, 'no errors');
        server.close();
        t.end();
    })

    repos.on('push', function (push) {
        t.equal(push.repo, 'doom', 'repo name');
        t.equal(push.commit, lastCommit, 'commit ok');
        t.equal(push.branch, 'master', 'master branch');

        t.equal(push.headers.host, 'localhost:' + port, 'http host');
        t.equal(push.method, 'POST', 'is a post');
        t.equal(push.url, '/doom/git-receive-pack', 'receive pack');

        push.accept();
    });

    var firstTag = true;
    repos.on('tag', function (tag) {
        t.equal(tag.repo, 'doom', 'repo name');
        t.equal(tag.version, '0.0.' + (firstTag? 1 : 2), 'tag received');

        t.equal(tag.headers.host, 'localhost:' + port, 'http host');
        t.equal(tag.method, 'POST', 'is a post');
        t.equal(tag.url, '/doom/git-receive-pack', 'receive pack');

        tag.accept();
        firstTag = false;
    });
});

test('repos.list', function(t) {
  const workingRepoDir = path.resolve(__dirname, 'fixtures', 'server', 'tmp');
  const notWorkingRepoDir = path.resolve(__dirname, 'fixtures', 'server', 'temp');
  t.plan(2);

  t.test('should return back with one directory in server', function(t) {
      const repos = gitserver(workingRepoDir, { autoCreate : true });
      repos.list(function(err, results) {
        t.ok(err === null, 'there is no error');
        t.deepEqual([ 'test.git' ], results);
        t.end();
      });
  });

  t.test('should return back with one directory in server', function(t) {
      const repos = gitserver(notWorkingRepoDir, { autoCreate : true });
      repos.list(function(err, results) {
        t.ok(err !== null, 'there is an error');
        t.ok(results === undefined);
        t.end();
      });
  });

  t.end();
});
