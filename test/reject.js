const test = require('tape');
const fs = require('fs');
const spawn_ = require('child_process').spawn;
function spawn(cmd, args, opts) {
    var ps = spawn_(cmd, args, opts);
    ps.on('error', (err) => {
        console.error( // eslint-disable-line
            err.message + ' while executing: '
            + cmd + ' ' + args.join(' ')
        );
    });
    return ps;
}

const exec = require('child_process').exec;
const http = require('http');
const async = require('async');

const gitserver = require('../');

test('create, push to, and clone a repo', (t) => {
    t.plan(13);

    var lastCommit;

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

    t.on('end', () => {
        server.close();
    });

    process.chdir(srcDir);
    async.waterfall([
        (callback) => {
            repos.create('doom', () => {
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
            fs.writeFile(srcDir + '/a.txt', 'abcd', (err) => {
                t.ok(!err, 'no error on write');
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
                'push', 'http://localhost:' + port + '/doom', 'master'
            ])
            .on('exit', (code) => {
                t.notEqual(code, 0);
                callback();
            });
        },
        (callback) => {
            const glog = spawn('git', [ 'log', '--all'], { cwd : repoDir + '/doom.git' });
            glog.on('exit', (code) => {
                t.equal(code, 128);
                callback();
            });
            var data = '';
            glog.stderr.on('data', (buf) => data += buf );
            glog.stderr.on('end', () => {
                const res = /fatal: bad default revision 'HEAD'/.test(data) || /fatal: your current branch 'master' does not have any commits yet/.test(data);
                t.ok(res);
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

        push.reject(500, 'ACCESS DENIED');
    });
});
