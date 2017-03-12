const test = require('tape');
const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const http = require('http');
const async = require('async');

const gitserver = require('../');

const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
const targetDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

fs.mkdirSync(repoDir, 0700);
fs.mkdirSync(srcDir, 0700);
fs.mkdirSync(dstDir, 0700);
fs.mkdirSync(targetDir, 0700);

let repos;

const server = http.createServer((req, res) => {
    repos.handle(req, res);
});

test(function (t) {
    server.listen(0, () => {
        setTimeout(t.end.bind(t), 1000);
    });
});

test('clone into programatic directories', (t) => {
    t.plan(21);

    repos = gitserver((dir) => {
        t.equal(dir, 'doom.git');
        return path.join(targetDir, dir);
    });
    const port = server.address().port;

    process.chdir(srcDir);
    async.waterfall([
        (callback) => {
            spawn('git', [ 'init' ])
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
            spawn('git', [ 'add', 'a.txt' ], {
                cwd: srcDir
            })
            .on('exit', (code) => {
                t.equal(code, 0);
                callback();
            });
        },
        (callback) => {
            spawn('git', [ 'commit', '-am', 'a!!' ], {
                cwd: srcDir
            })
            .on('exit', (code) => {
                t.equal(code, 0);
                callback();
            });
        },
        (callback) => {
            spawn('git', [
                'push', 'http://localhost:' + port + '/doom.git', 'master'
            ], {
                cwd: srcDir
            })
            .on('exit', (code) => {
                t.equal(code, 0);
                callback();
            });
        },
        (callback) => {
            process.chdir(dstDir);
            spawn('git', [ 'clone', 'http://localhost:' + port + '/doom.git' ])
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
        },
        (callback) => {
            fs.stat(targetDir + '/doom.git/HEAD', (ex) => {
                t.ok(!ex, 'INFO exists');
                callback();
            });
        }
    ], (err) => {
        t.ok(!err, 'no errors');
        server.close();
        t.end();
    });

    repos.on('push', (push) => {
        t.equal(push.repo, 'doom.git');
        push.accept();
    });
});
