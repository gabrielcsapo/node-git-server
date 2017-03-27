const test = require('tape');
const fs = require('fs');
const spawn = require('child_process').spawn;
const async = require('async');

const gitserver = require('../');

test('create git server via listen() command', (t) => {
    t.plan(2);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = gitserver(repoDir);
    const port = Math.floor(Math.random() * ((1<<16) - 1e4)) + 1e4;
    repos.listen(port);

    process.chdir(srcDir);
    async.waterfall([
        (callback) => {
            process.chdir(dstDir);
            spawn('git', [ 'clone', 'http://localhost:' + port + '/doom' ])
            .on('exit', (code) => {
                t.equal(code, 0);
                callback();
            });
        },
    ], (err) => {
        t.ok(!err, 'no errors');
        repos.close();
        t.end();
    });
});
