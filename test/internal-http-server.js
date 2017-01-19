var test = require('tape');
var pushover = require('../');

var fs = require('fs');

var spawn = require('child_process').spawn;

var async = require('async');

test('create git server via listen() command', function (t) {
    t.plan(2);

    var repoDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var srcDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);
    var dstDir = '/tmp/' + Math.floor(Math.random() * (1<<30)).toString(16);

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    var repos = pushover(repoDir);
    var port = Math.floor(Math.random() * ((1<<16) - 1e4)) + 1e4;
    repos.listen(port)

    process.chdir(srcDir);
    async.waterfall([
        function (callback) {
            process.chdir(dstDir);
            spawn('git', [ 'clone', 'http://localhost:' + port + '/doom' ])
            .on('exit', function (code) {
                t.equal(code, 0);
                callback();
            });
        },
    ], function(err) {
        t.ok(!err, 'no errors');
        repos.close();
        t.end();
    })
});
