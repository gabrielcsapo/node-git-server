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
    t.plan(28);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    let lastCommit;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = gitserver(repoDir, {
        autoCreate: true
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
        repos.handle(req, res);
    });
    server.listen(port);

    process.chdir(srcDir);
    async.waterfall([
        (callback) => {
            repos.create('doom', () => {
                callback();
            });
        },
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
            spawn('git', ['tag', '0.0.1'])
                .on('exit', (code) => {
                    t.equal(code, 0);
                    callback();
                });
        },
        (callback) => {
            fs.writeFile(srcDir + '/a.txt', 'efgh', (err) => {
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
                .on('exit', () => {
                    exec('git log | head -n1', (err, stdout) => {
                        lastCommit = stdout.split(/\s+/)[1];
                        callback();
                    });
                });
        },
        (callback) => {
            spawn('git', ['tag', '0.0.2'])
                .on('exit', (code) => {
                    t.equal(code, 0);
                    callback();
                });
        },
        (callback) => {
            spawn('git', [
                    'push', '--tags', 'http://localhost:' + port + '/doom', 'master'
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
        t.equal(push.repo, 'doom', 'repo name');
        t.equal(push.commit, lastCommit, 'commit ok');
        t.equal(push.branch, 'master', 'master branch');

        t.equal(push.headers.host, 'localhost:' + port, 'http host');
        t.equal(push.method, 'POST', 'is a post');
        t.equal(push.url, '/doom/git-receive-pack', 'receive pack');

        push.accept();
    });

    var firstTag = true;
    repos.on('tag', (tag) => {
        t.equal(tag.repo, 'doom', 'repo name');
        t.equal(tag.version, '0.0.' + (firstTag ? 1 : 2), 'tag received');

        t.equal(tag.headers.host, 'localhost:' + port, 'http host');
        t.equal(tag.method, 'POST', 'is a post');
        t.equal(tag.url, '/doom/git-receive-pack', 'receive pack');

        tag.accept();
        firstTag = false;
    });
});

test('repos.list', (t) => {
    t.plan(2);

    const workingRepoDir = path.resolve(__dirname, 'fixtures', 'server', 'tmp');
    const notWorkingRepoDir = path.resolve(__dirname, 'fixtures', 'server', 'temp');

    t.test('should return back with one directory in server', (t) => {
        const repos = gitserver(workingRepoDir, {
            autoCreate: true
        });
        repos.list((err, results) => {
            t.ok(err === null, 'there is no error');
            t.deepEqual(['test.git'], results);
            t.end();
        });
    });

    t.test('should return back error directory does not exist', (t) => {
        const repos = gitserver(notWorkingRepoDir, {
            autoCreate: true
        });
        repos.list((err, results) => {
            t.ok(err !== null, 'there is an error');
            t.ok(results === undefined);
            t.end();
        });
    });

    t.end();
});
