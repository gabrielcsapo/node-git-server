const test = require('tape');

const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const exec = require('child_process').exec;
const http = require('http');
const async = require('async');

const GitServer = require('../');

test('git', (t) => {
  t.plan(10);

  t.test('create, push to, and clone a repo', (t) => {
    var lastCommit;

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir, {
      autoCreate: true
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
      repos.handle(req, res);
    }).listen(port);

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
        spawn('git', ['init'])
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
        spawn('git', ['clone', 'http://localhost:' + port + '/xyz/doom'])
          .on('exit', (code) => {
            t.equal(code, 0);
            callback();
          });
      },
      (callback) => {
        fs.exists(dstDir + '/doom/a.txt', (ex) => {
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



  t.test('create, push to, and clone a repo successful', (t) => {
    t.plan(9);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir);
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

  test('clone into programatic directories', (t) => {
    t.plan(21);

    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const targetDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);
    fs.mkdirSync(targetDir, 0700);

    const server = new GitServer((dir) => {
      t.equal(dir, 'doom.git');
      return path.join(targetDir, dir);
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
        spawn('git', ['add', 'a.txt'], {
            cwd: srcDir
          })
          .on('exit', (code) => {
            t.equal(code, 0);
            callback();
          });
      },
      (callback) => {
        spawn('git', ['commit', '-am', 'a!!'], {
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
        spawn('git', ['clone', 'http://localhost:' + port + '/doom.git'])
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

    server.on('push', (push) => {
      t.equal(push.repo, 'doom.git');
      push.accept();
    });
  });

  test('test tagging', (t) => {
    t.plan(28);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    var lastCommit;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir, {
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
        fs.exists(dstDir + '/doom/a.txt', (ex) => {
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

  t.test('repos list', (t) => {
    t.plan(2);

    const workingRepoDir = path.resolve(__dirname, 'fixtures', 'server', 'tmp');
    const notWorkingRepoDir = path.resolve(__dirname, 'fixtures', 'server', 'temp');

    t.test('should return back with one directory in server', (t) => {
      t.plan(2);

      const repos = new GitServer(workingRepoDir, {
        autoCreate: true
      });

      repos.list((err, results) => {
        t.ok(err === null, 'there is no error');
        t.deepEqual(['test.git'], results);
        t.end();
      });
    });

    t.test('should return back error directory does not exist', (t) => {
      t.plan(2);

      const repos = new GitServer(notWorkingRepoDir, {
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

  test('create, push to, and clone a repo reject', (t) => {
    t.plan(13);

    function _spawn(cmd, args, opts) {
      var ps = spawn(cmd, args, opts);
      ps.on('error', (err) => {
        console.error( // eslint-disable-line
          err.message + ' while executing: ' +
          cmd + ' ' + args.join(' ')
        );
      });
      return ps;
    }

    var lastCommit;

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir, {
      autoCreate: true
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
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
        _spawn('git', ['init'])
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
        _spawn('git', ['add', 'a.txt'])
          .on('exit', (code) => {
            t.equal(code, 0);
            callback();
          });
      },
      (callback) => {
        _spawn('git', ['commit', '-am', 'a!!'])
          .on('exit', () => {
            exec('git log | head -n1', (err, stdout) => {
              lastCommit = stdout.split(/\s+/)[1];
              callback();
            });
          });
      },
      (callback) => {
        _spawn('git', [
            'push', 'http://localhost:' + port + '/doom', 'master'
          ])
          .on('exit', (code) => {
            t.notEqual(code, 0);
            callback();
          });
      },
      (callback) => {
        const glog = _spawn('git', ['log'], {
          cwd: repoDir + '/doom.git'
        });
        glog.on('exit', (code) => {
          t.equal(code, 128);
          callback();
        });
        var data = '';
        glog.stderr.on('data', (buf) => data += buf);
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

  t.test('create git server via listen() command', (t) => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir);
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    t.equal(repos.listen(port), repos);

    process.chdir(srcDir);
    async.waterfall([
      (callback) => {
        process.chdir(dstDir);
        spawn('git', ['clone', 'http://localhost:' + port + '/doom'])
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

  t.test('should return promise that resolves when server is closed if no callback specified', (t) => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);

    const repos = new GitServer(repoDir);
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    repos.listen(port, () => {
      repos.close().then(() => {
        t.end();
      });
    });
  });

  t.test('should be able to protect certain routes', (t) => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir, {
      autoCreate: true,
      authenticate: ({ type, repo, user }, next) => {

        if (type == 'download', repo == 'doom') {
          user((username, password) => {
            if (username == 'root' && password == 'root') {
              next();
            } else {
              next('that is not the correct password');
            }
          });
        } else {
          next('that is not the correct password');
        }
      }
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    repos.listen(port);

    process.chdir(srcDir);
    async.waterfall([
      (callback) => {
        process.chdir(dstDir);
        const clone = spawn('git', ['clone', `http://root:root@localhost:${port}/doom.git`]);

        clone.on('close', function(code) {
          t.equal(code, 0);
          callback();
        });
      },
      (callback) => {
        process.chdir(dstDir);
        const clone = spawn('git', ['clone', `http://root:world@localhost:${port}/doom.git doom1`]);
        let error = '';

        clone.stderr.on('data', (d) => {
          error += d.toString('utf8');
        });

        clone.on('close', function(code) {
          t.equal(error, `Cloning into 'doom.git doom1'...\nfatal: unable to access 'http://root:world@localhost:${port}/doom.git doom1/': Empty reply from server\n`);
          t.equal(code, 128);
          callback();
        });
      }
    ], (err) => {
      t.ok(!err, 'no errors');
      repos.close();
      t.end();
    });

  });

  t.test('should be able to access headers in authenticate', (t) => {
    t.plan(14);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir, {
      autoCreate: true,
      authenticate: ({ type, repo, user, headers }, next) => {
        if (type == 'download', repo == 'doom') {
          t.ok(headers['host']);
          t.ok(headers['user-agent']);
          t.ok(headers['accept']);
          t.ok(headers['pragma']);
          t.ok(headers['accept-encoding']);

          user((username, password) => {
            if (username == 'root' && password == 'root') {
              next();
            } else {
              next('that is not the correct password');
            }
          });
        } else {
          next('that is not the correct password');
        }
      }
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    repos.listen(port);

    process.chdir(srcDir);
    async.waterfall([
      (callback) => {
        process.chdir(dstDir);
        const clone = spawn('git', ['clone', `http://root:root@localhost:${port}/doom.git`]);

        clone.on('close', function(code) {
          t.equal(code, 0);
          callback();
        });
      },
      (callback) => {
        process.chdir(dstDir);
        const clone = spawn('git', ['clone', `http://root:world@localhost:${port}/doom.git doom1`]);
        let error = '';

        clone.stderr.on('data', (d) => {
          error += d.toString('utf8');
        });

        clone.on('close', function(code) {
          t.equal(error, `Cloning into 'doom.git doom1'...\nfatal: unable to access 'http://root:world@localhost:${port}/doom.git doom1/': Empty reply from server\n`);
          t.equal(code, 128);
          callback();
        });
      }
    ], (err) => {
      t.ok(!err, 'no errors');
      repos.close();
      t.end();
    });

  });

  t.test('should be able to protect certain routes with a promised authenticate', (t) => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir, {
      autoCreate: true,
      authenticate: ({ type, repo, user }) => {
        return new Promise(function(resolve, reject) {
          if (type == 'download', repo == 'doom') {
            user((username, password) => {
              if (username == 'root' && password == 'root') {
                return resolve();
              } else {
                return reject('that is not the correct password');
              }
            });
          } else {
            return reject('that is not the correct password');
          }
        });
      }
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    repos.listen(port);

    process.chdir(srcDir);
    async.waterfall([
      (callback) => {
        process.chdir(dstDir);
        const clone = spawn('git', ['clone', `http://root:root@localhost:${port}/doom.git`]);

        clone.on('close', function(code) {
          t.equal(code, 0);
          callback();
        });
      },
      (callback) => {
        process.chdir(dstDir);
        const clone = spawn('git', ['clone', `http://root:world@localhost:${port}/doom.git doom1`]);
        let error = '';

        clone.stderr.on('data', (d) => {
          error += d.toString('utf8');
        });

        clone.on('close', function(code) {
          t.equal(error, `Cloning into 'doom.git doom1'...\nfatal: unable to access 'http://root:world@localhost:${port}/doom.git doom1/': Empty reply from server\n`);
          t.equal(code, 128);
          callback();
        });
      }
    ], (err) => {
      t.ok(!err, 'no errors');
      repos.close();
      t.end();
    });
  });

  t.test('should be able to send custom messages to git client (main stream)', (t) => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir, {
      autoCreate: true
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;

    repos.on('push', (push) => {
      console.log(`push ${push.repo}/${push.commit}`); // eslint-disable-line
      push.log(' ');
      push.log('Have a great day!');
      push.log(' ');

      push.accept();
    });

    repos.listen(port);

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
        fs.writeFile(srcDir + '/a.txt', 'abcd', () => {
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
        spawn('git', ['commit', '-m', 'a!!'])
          .on('exit', () => {
            callback();
          });
      },
      (callback) => {
        const logs = [];
        const push = spawn('git', [
          'push', 'http://localhost:' + port + '/doom.git', 'master'
        ]);

        push.stdout.on('data', (data) => {
          if (data.toString() !== '') {
            logs.push(data.toString());
          }
        });

        push.stderr.on('data', (data) => {
          if (data.toString() !== '') {
            logs.push(data.toString());
          }
        });

        push.on('exit', () => {
          t.ok(logs.join(' ').indexOf('remote: Have a great day!') > -1);
          callback();
        });
      },
    ], (err) => {
      t.ok(!err, 'no errors');
      repos.close();
      t.end();
    });
  });

  t.test('should be able to send custom messages to git client (response stream)', (t) => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, 0700);
    fs.mkdirSync(srcDir, 0700);
    fs.mkdirSync(dstDir, 0700);

    const repos = new GitServer(repoDir, {
      autoCreate: true
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;

    repos.on('push', (push) => {
      console.log(`push ${push.repo}/${push.commit}`); // eslint-disable-line

      push.on('response', stream => {
        stream.log(' ');
        stream.log('Have a great day!');
        stream.log(' ');
      });

      push.accept();
    });

    repos.listen(port);

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
        fs.writeFile(srcDir + '/a.txt', 'abcd', () => {
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
        spawn('git', ['commit', '-m', 'a!!'])
          .on('exit', () => {
            callback();
          });
      },
      (callback) => {
        const logs = [];
        const push = spawn('git', [
          'push', 'http://localhost:' + port + '/doom.git', 'master'
        ]);

        push.stdout.on('data', (data) => {
          if (data.toString() !== '') {
            logs.push(data.toString());
          }
        });

        push.stderr.on('data', (data) => {
          if (data.toString() !== '') {
            logs.push(data.toString());
          }
        });

        push.on('exit', () => {
          t.ok(logs.join(' ').indexOf('remote: Have a great day!') > -1);
          callback();
        });
      },
    ], (err) => {
      t.ok(!err, 'no errors');
      repos.close();
      t.end();
    });
  });
});
