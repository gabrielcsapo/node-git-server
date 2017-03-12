const test = require('tape');
const fs = require('fs');
const path = require('path');
const exists = fs.exists || path.exists;
const spawn = require('child_process').spawn;
const exec = require('child_process').exec;
const http = require('http');
const async = require('async');

const gitserver = require('../');

test('create, push to, and clone a repo', (t) => {
    t.plan(12);

    let lastCommit;

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = gitserver(repoDir, { autoCreate : true });
    const port = Math.floor(Math.random() * ((1<<16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
        repos.handle(req, res);
    });
    server.listen(port);

    process.chdir(srcDir);
    async.waterfall([
        (callback) => {
            repos.mkdir('xyz', () => {
                callback();
            });
        },
        (callback) => {
            repos.create('xyz/doom', () => {
                callback();
            });
        },
        (callback) => {
            spawn('git', [ 'init' ])
            .on('exit', (code) => {
                t.equal(code, 0);
                callback();
            });
        },
        (callback) => {
            fs.writeFile(srcDir + '/a.txt', 'abcd', () => {
                callback();
            });
        },
        (callback) => {
            spawn('git', [ 'add', 'a.txt' ])
            .on('exit', (code) => {
                t.equal(code, 0);
                callback();
            });
        },
        (callback) => {
            spawn('git', [ 'commit', '-am', 'a!!' ])
            .on('exit', () => {
                exec('git log | head -n1', (err, stdout) => {
                    lastCommit = stdout.split(/\s+/)[1];
                    callback();
                });
            });
        },
        (callback) => {
            spawn('git', [
                'push', 'http://localhost:' + port + '/xyz/doom', 'master'
            ])
            .on('exit', (code) => {
                t.equal(code, 0);
                callback();
            });
        },
        (callback) => {
            process.chdir(dstDir);
            spawn('git', [ 'clone', 'http://localhost:' + port + '/xyz/doom' ])
            .on('exit', (code) => {
                t.equal(code, 0);
                callback();
            });
        },
        (callback) => {
            exists(dstDir + '/doom/a.txt', (ex) => {
                t.ok(ex, 'a.txt exists');
                callback();
            });
        }
    ], (err) => {
        t.ok(!err, 'no errors');
        server.close();
        t.end();
    });

    repos.on('push', (push) => {
        t.equal(push.repo, 'xyz/doom', 'repo name');
        t.equal(push.commit, lastCommit, 'commit ok');
        t.equal(push.branch, 'master', 'master branch');

        t.equal(push.headers.host, 'localhost:' + port, 'http host');
        t.equal(push.method, 'POST', 'is a post');
        t.equal(push.url, '/xyz/doom/git-receive-pack', 'receive pack');

        push.accept();
    });
});
