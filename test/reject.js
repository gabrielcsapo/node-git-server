var test = require('tape');
var pushover = require('../');

var fs = require('fs');
var path = require('path');
var os = require('os');

var spawn_ = require('child_process').spawn;
function spawn (cmd, args, opts) {
    var ps = spawn_(cmd, args, opts);
    ps.on('error', function (err) {
        console.error(
            err.message + ' while executing: '
            + cmd + ' ' + args.join(' ')
        );
    });
    return ps;
}
var exec = require('child_process').exec;
var http = require('http');

var async = require('async');

test('create, push to, and clone a repo', function (t) {
    t.plan(13);

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

    t.on('end', function () {
        server.close();
    });

    process.chdir(srcDir);
    async.waterfall([
        function (callback) {
            repos.create('doom', function() {
                callback();
            })
        },
        function (callback) {
            var ps = spawn('git', [ 'init' ])
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
                'push', 'http://localhost:' + port + '/doom', 'master'
            ])
            .on('exit', function (code) {
                t.notEqual(code, 0);
                callback();
            });
        },
        function (callback) {
            var glog = spawn('git', [ 'log', '--all'], { cwd : repoDir + '/doom.git' });
            glog.on('exit', function (code) {
                t.equal(code, 128);
                callback();
            });
            var data = '';
            glog.stderr.on('data', function (buf) { data += buf });
            glog.stderr.on('end', function (buf) {
                var res = /fatal: bad default revision 'HEAD'/.test(data) || /fatal: your current branch 'master' does not have any commits yet/.test(data);
                t.ok(res);
            });
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

        push.reject(500, 'ACCESS DENIED');
    });
});
