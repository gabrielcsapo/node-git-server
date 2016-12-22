var test = require('tape');
var pushover = require('../');

var fs = require('fs');
var path = require('path');

var spawn = require('child_process').spawn;
var http = require('http');

var async = require('async');

var repoDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
var srcDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
var dstDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
var targetDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);

fs.mkdirSync(repoDir, 0700);
fs.mkdirSync(srcDir, 0700);
fs.mkdirSync(dstDir, 0700);
fs.mkdirSync(targetDir, 0700);

var repos;
var server = http.createServer(function (req, res) {
    repos.handle(req, res);
});

test(function (t) {
    server.listen(0, function () {
        setTimeout(t.end.bind(t), 1000);
    });
});

test('clone into programatic directories', function (t) {
    t.plan(21);

    repos = pushover(function (dir) {
        t.equal(dir, 'doom.git');
        return path.join(targetDir, dir);
    });
    var port = server.address().port;

    process.chdir(srcDir);
    async.waterfall([
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
            spawn('git', [ 'add', 'a.txt' ], {
                cwd: srcDir
            })
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            spawn('git', [ 'commit', '-am', 'a!!' ], {
                cwd: srcDir
            })
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            var ps = spawn('git', [
                'push', 'http://localhost:' + port + '/doom.git', 'master'
            ], {
                cwd: srcDir
            })
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
        function (callback) {
            process.chdir(dstDir);
            spawn('git', [ 'clone', 'http://localhost:' + port + '/doom.git' ])
                .on('exit', function (code) {
                    t.equal(code, 0);
                    callback();
                });
        },
        function (callback) {
            fs.stat(dstDir + '/doom/a.txt', function (ex) {
                t.ok(!ex, 'a.txt exists');
                callback();
            })
        },
        function (callback) {
            fs.stat(targetDir + '/doom.git/HEAD', function (ex) {
                t.ok(!ex, 'INFO exists');
                callback();
            })
        }
    ], function(err) {
        t.ok(!err, 'no errors');
        server.close();
        t.end();
    })

    repos.on('push', function (push) {
        t.equal(push.repo, 'doom.git');
        push.accept();
    });
});
