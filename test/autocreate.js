const test = require('tape');
const fs = require('fs');
const spawn = require('child_process').spawn;
const http = require('http');
const async = require('async');

const gitserver = require('../');

test('create, push to, and clone a repo', (t) => {
    t.plan(9);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = gitserver(repoDir);
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
        repos.handle(req, res);
    });
    server.listen(port);

    process.chdir(srcDir);
    async.waterfall([
        (callback) => {
            spawn('git', ['init'])
                .on('exit', (code) => {
                    t.equal(code, 0);
                    callback();
                });
        },
        (callback) => {
            fs.writeFile(srcDir + '/a.txt', 'abcd', (err) => {
                t.ok(!err, 'no error on write');
                callback();
            });
        },
        (callback) => {
            spawn('git', ['add', 'a.txt'])
                .on('exit', (code) => {
                    t.equal(code, 0);
                    callback();
                });
        },
        (callback) => {
            spawn('git', ['commit', '-am', 'a!!'])
                .on('exit', (code) => {
                    t.equal(code, 0);
                    callback();
                });
        },
        (callback) => {
            spawn('git', [
                    'push', 'http://localhost:' + port + '/doom', 'master'
                ])
                .on('exit', (code) => {
                    t.equal(code, 0);
                    callback();
                });
        },
        (callback) => {
            process.chdir(dstDir);
            spawn('git', ['clone', 'http://localhost:' + port + '/doom'])
                .on('exit', (code) => {
                    t.equal(code, 0);
                    callback();
                });
        },
        (callback) => {
            fs.stat(dstDir + '/doom/a.txt', (ex) => {
                t.ok(!ex, 'a.txt exists');
                callback();
            });
        }
    ], (err) => {
        t.ok(!err, 'no errors');
        server.close();
        t.end();
    });

    repos.on('push', (push) => {
        t.equal(push.repo, 'doom');
        push.accept();
    });
});
