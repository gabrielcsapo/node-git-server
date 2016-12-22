var test = require('tape');
var pushover = require('../');

var fs = require('fs');

var spawn = require('child_process').spawn;
var http = require('http');

var async = require('async');

test('create, push to, and clone a repo', function (t) {
    t.plan(9);

    var repoDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var srcDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var dstDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    var repos = pushover(repoDir);
    var port = Math.floor(Math.random() * ((1<<16) - 1e4)) + 1e4;
    var server = http.createServer(function (req, res) {
        repos.handle(req, res);
    });
    server.listen(port);

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
            spawn('git', [
                'push', 'http://localhost:' + port + '/doom', 'master'
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
            fs.stat(dstDir + '/doom/a.txt', function (ex, stats) {
                t.ok(!ex, 'a.txt exists');
                callback();
            })
        }
    ], function(err) {
        t.ok(!err, 'no errors');
        server.close();
        t.end();
    })

    repos.on('push', function (push) {
        t.equal(push.repo, 'doom');
        push.accept();
    });
});
