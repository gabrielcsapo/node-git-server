var test = require('tape');
var pushover = require('../');

var fs = require('fs');
var path = require('path');
var exists = fs.exists || path.exists;

var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var http = require('http');

var async = require('async');

test('create, push to, and clone a repo', function (t) {
    t.plan(12);

    var repoDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var srcDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var dstDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var lastCommit;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    var repos = pushover(repoDir, { autoCreate : true });
    var port = Math.floor(Math.random() * ((1<<16) - 1e4)) + 1e4;
    var server = http.createServer(function (req, res) {
        repos.handle(req, res);
    });
    server.listen(port);

    process.chdir(srcDir);
    async.waterfall([
        function (callback) {
            repos.mkdir('xyz', function() {
                callback();
            });
        },
        function (callback) {
            repos.create('xyz/doom', function() {
                callback();
            });
        },
        function (callback) {
            spawn('git', [ 'init' ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            fs.writeFile(srcDir + '/a.txt', 'abcd', function () {
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
            var ps = spawn('git', [ 'commit', '-am', 'a!!' ]);
            ps.on('exit', function () {
                exec('git log | head -n1', function (err, stdout) {
                    lastCommit = stdout.split(/\s+/)[1];
                    callback();
                });
            });
        },
        function (callback) {
            spawn('git', [
                'push', 'http://localhost:' + port + '/xyz/doom', 'master'
            ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            process.chdir(dstDir);
            spawn('git', [ 'clone', 'http://localhost:' + port + '/xyz/doom' ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            exists(dstDir + '/doom/a.txt', function (ex) {
                t.ok(ex, 'a.txt exists');
                callback();
            });
        }
    ], function(err) {
        t.ok(!err, 'no errors');
        server.close();
        t.end();
    })

    repos.on('push', function (push) {
        t.equal(push.repo, 'xyz/doom', 'repo name');
        t.equal(push.commit, lastCommit, 'commit ok');
        t.equal(push.branch, 'master', 'master branch');

        t.equal(push.headers.host, 'localhost:' + port, 'http host');
        t.equal(push.method, 'POST', 'is a post');
        t.equal(push.url, '/xyz/doom/git-receive-pack', 'receive pack');

        push.accept();
    });
});
