const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");
const http = require("http");
const async = require("async");

const { Git } = require("../");

describe("git", () => {
  expect.assertions(10);

  test("create, push to, and clone a repo", (done) => {
    var lastCommit;

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, '0700');
    fs.mkdirSync(srcDir, '0700');
    fs.mkdirSync(dstDir, '0700');

    const repos = new Git(repoDir, {
      autoCreate: true,
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http
      .createServer((req, res) => {
        repos.handle(req, res);
      })
      .listen(port);

    process.chdir(srcDir);

    async.waterfall(
      [
        (callback) => {
          repos.mkdir("xyz", () => {
            callback();
          });
        },
        (callback) => {
          repos.create("xyz/doom", () => {
            callback();
          });
        },
        (callback) => {
          spawn("git", ["init"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          fs.writeFile(srcDir + "/a.txt", "abcd", () => {
            callback();
          });
        },
        (callback) => {
          spawn("git", ["add", "a.txt"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          spawn("git", ["commit", "-am", "a!!"]).on("exit", () => {
            exec("git log | head -n1", (err, stdout) => {
              lastCommit = stdout.split(/\s+/)[1];
              callback();
            });
          });
        },
        (callback) => {
          spawn("git", [
            "push",
            "http://localhost:" + port + "/xyz/doom",
            "master",
          ]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          process.chdir(dstDir);
          spawn("git", ["clone", "http://localhost:" + port + "/xyz/doom"]).on(
            "exit",
            (code) => {
              expect(code).toBe(0);
              callback();
            }
          );
        },
        (callback) => {
          fs.exists(dstDir + "/doom/a.txt", (ex) => {
            expect(ex).toBeTruthy();
            callback();
          });
        },
      ],
      (err) => {
        expect(!err).toBeTruthy();
        server.close();
        done();
      }
    );

    repos.on("push", (push) => {
      expect(push.repo).toBe("xyz/doom");
      expect(push.commit).toBe(lastCommit);
      expect(push.branch).toBe("master");

      expect(push.headers.host).toBe("localhost:" + port);
      expect(push.method).toBe("POST");
      expect(push.url).toBe("/xyz/doom/git-receivee-pack");

      push.accept();
    });
  });

  test("create, push to, and clone a repo successful", (done) => {
    expect.assertions(9);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, '0700');
    fs.mkdirSync(srcDir, '0700');
    fs.mkdirSync(dstDir, '0700');

    const repos = new Git(repoDir);
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
      repos.handle(req, res);
    });
    server.listen(port);

    process.chdir(srcDir);
    async.waterfall(
      [
        (callback) => {
          spawn("git", ["init"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          fs.writeFile(srcDir + "/a.txt", "abcd", (err) => {
            expect(!err).toBeTruthy();
            callback();
          });
        },
        (callback) => {
          spawn("git", ["add", "a.txt"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          spawn("git", ["commit", "-am", "a!!"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          spawn("git", [
            "push",
            "http://localhost:" + port + "/doom",
            "master",
          ]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          process.chdir(dstDir);
          spawn("git", ["clone", "http://localhost:" + port + "/doom"]).on(
            "exit",
            (code) => {
              expect(code).toBe(0);
              callback();
            }
          );
        },
        (callback) => {
          fs.stat(dstDir + "/doom/a.txt", (ex) => {
            expect(!ex).toBeTruthy();
            callback();
          });
        },
      ],
      (err) => {
        expect(!err).toBeTruthy();
        server.close();
        done();
      }
    );

    repos.on("push", (push) => {
      expect(push.repo).toBe("doom");
      push.accept();
    });
  });

  test("clone into programatic directories", (done) => {
    expect.assertions(21);

    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const targetDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;

    fs.mkdirSync(repoDir, '0700');
    fs.mkdirSync(srcDir, '0700');
    fs.mkdirSync(dstDir, '0700');
    fs.mkdirSync(targetDir, '0700');

    const server = new Git((dir) => {
      expect(dir).toBe("doom.git");
      return path.join(targetDir, dir);
    });
    server.listen(port);

    process.chdir(srcDir);
    async.waterfall(
      [
        (callback) => {
          spawn("git", ["init"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          fs.writeFile(srcDir + "/a.txt", "abcd", (err) => {
            expect(!err).toBeTruthy();
            callback();
          });
        },
        (callback) => {
          spawn("git", ["add", "a.txt"], {
            cwd: srcDir,
          }).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          spawn("git", ["commit", "-am", "a!!"], {
            cwd: srcDir,
          }).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          spawn(
            "git",
            ["push", "http://localhost:" + port + "/doom.git", "master"],
            {
              cwd: srcDir,
            }
          ).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          process.chdir(dstDir);
          spawn("git", ["clone", "http://localhost:" + port + "/doom.git"]).on(
            "exit",
            (code) => {
              expect(code).toBe(0);
              callback();
            }
          );
        },
        (callback) => {
          fs.stat(dstDir + "/doom/a.txt", (ex) => {
            expect(!ex).toBeTruthy();
            callback();
          });
        },
        (callback) => {
          fs.stat(targetDir + "/doom.git/HEAD", (ex) => {
            expect(!ex).toBeTruthy();
            callback();
          });
        },
      ],
      (err) => {
        expect(!err).toBeTruthy();
        server.close();
        done();
      }
    );

    server.on("push", (push) => {
      expect(push.repo).toBe("doom.git");
      push.accept();
    });
  });

  test("test tagging", (done) => {
    expect.assertions(28);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    var lastCommit;

    fs.mkdirSync(repoDir, '0700');
    fs.mkdirSync(srcDir, '0700');
    fs.mkdirSync(dstDir, '0700');

    const repos = new Git(repoDir, {
      autoCreate: true,
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
      repos.handle(req, res);
    });
    server.listen(port);

    process.chdir(srcDir);
    async.waterfall(
      [
        (callback) => {
          repos.create("doom", () => {
            callback();
          });
        },
        (callback) => {
          spawn("git", ["init"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          fs.writeFile(srcDir + "/a.txt", "abcd", (err) => {
            expect(!err).toBeTruthy();
            callback();
          });
        },
        (callback) => {
          spawn("git", ["add", "a.txt"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          spawn("git", ["commit", "-am", "a!!"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          spawn("git", ["tag", "0.0.1"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          fs.writeFile(srcDir + "/a.txt", "efgh", (err) => {
            expect(!err).toBeTruthy();
            callback();
          });
        },
        (callback) => {
          spawn("git", ["add", "a.txt"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          spawn("git", ["commit", "-am", "a!!"]).on("exit", () => {
            exec("git log | head -n1", (err, stdout) => {
              lastCommit = stdout.split(/\s+/)[1];
              callback();
            });
          });
        },
        (callback) => {
          spawn("git", ["tag", "0.0.2"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          spawn("git", [
            "push",
            "--tags",
            "http://localhost:" + port + "/doom",
            "master",
          ]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          process.chdir(dstDir);
          spawn("git", ["clone", "http://localhost:" + port + "/doom"]).on(
            "exit",
            (code) => {
              expect(code).toBe(0);
              callback();
            }
          );
        },
        (callback) => {
          fs.exists(dstDir + "/doom/a.txt", (ex) => {
            expect(ex).toBeTruthy();
            callback();
          });
        },
      ],
      (err) => {
        expect(!err).toBeTruthy();
        server.close();
        done();
      }
    );

    repos.on("push", (push) => {
      expect(push.repo).toBe("doom");
      expect(push.commit).toBe(lastCommit);
      expect(push.branch).toBe("master");

      expect(push.headers.host).toBe("localhost:" + port);
      expect(push.method).toBe("POST");
      expect(push.url).toBe("/doom/git-receive-pack");

      push.accept();
    });

    var firstTag = true;
    repos.on("tag", (tag) => {
      expect(tag.repo).toBe("doom");
      expect(tag.version).toBe("0.0." + (firstTag ? 1 : 2));

      expect(tag.headers.host).toBe("localhost:" + port);
      expect(tag.method).toBe("POST");
      expect(tag.url).toBe("/doom/git-receive-pack");

      tag.accept();
      firstTag = false;
    });
  });

  describe("repos list", () => {
    expect.assertions(2);

    const workingRepoDir = path.resolve(__dirname, "fixtures", "server", "tmp");
    const notWorkingRepoDir = path.resolve(
      __dirname,
      "fixtures",
      "server",
      "temp"
    );

    test("should return back with one directory in server", (done) => {
      expect.assertions(2);

      const repos = new Git(workingRepoDir, {
        autoCreate: true,
      });

      repos.list((err, results) => {
        expect(err === null).toBeTruthy();
        expect(["test.git"]).toEqual(results);
        done();
      });
    });

    test("should return back error directory does not exist", (done) => {
      expect.assertions(2);

      const repos = new Git(notWorkingRepoDir, {
        autoCreate: true,
      });

      repos.list((err, results) => {
        expect(err !== null).toBeTruthy();
        expect(results === undefined).toBeTruthy();
        done();
      });
    });
  });

  test("create, push to, and clone a repo reject", (done) => {
    expect.assertions(13);

    function _spawn(cmd, args, opts) {
      var ps = spawn(cmd, args, opts);
      ps.on("error", (err) => {
        console.error( // eslint-disable-line
          err.message + " while executing: " + cmd + " " + args.join(" ")
        );
      });
      return ps;
    }

    var lastCommit;

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, '0700');
    fs.mkdirSync(srcDir, '0700');
    fs.mkdirSync(dstDir, '0700');

    const repos = new Git(repoDir, {
      autoCreate: true,
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
      repos.handle(req, res);
    });
    server.listen(port);

    t.on("end", () => {
      server.close();
    });

    process.chdir(srcDir);
    async.waterfall(
      [
        (callback) => {
          repos.create("doom", () => {
            callback();
          });
        },
        (callback) => {
          _spawn("git", ["init"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          fs.writeFile(srcDir + "/a.txt", "abcd", (err) => {
            expect(!err).toBeTruthy();
            callback();
          });
        },
        (callback) => {
          _spawn("git", ["add", "a.txt"]).on("exit", (code) => {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          _spawn("git", ["commit", "-am", "a!!"]).on("exit", () => {
            exec("git log | head -n1", (err, stdout) => {
              lastCommit = stdout.split(/\s+/)[1];
              callback();
            });
          });
        },
        (callback) => {
          _spawn("git", [
            "push",
            "http://localhost:" + port + "/doom",
            "master",
          ]).on("exit", (code) => {
            expect(code).not.toBe(0);
            callback();
          });
        },
        (callback) => {
          const glog = _spawn("git", ["log"], {
            cwd: repoDir + "/doom.git",
          });
          glog.on("exit", (code) => {
            expect(code).toBe(128);
            callback();
          });
          var data = "";
          glog.stderr.on("data", (buf) => (data += buf));
          glog.stderr.on("end", () => {
            const res =
              /fatal: bad default revision 'HEAD'/.test(data) ||
              /fatal: your current branch 'master' does not have any commits yet/.test(
                data
              );
            expect(res).toBeTruthy();
          });
        },
      ],
      (err) => {
        expect(!err).toBeTruthy();
        server.close();
        done();
      }
    );

    repos.on("push", (push) => {
      expect(push.repo).toBe("doom");
      expect(push.commit).toBe(lastCommit);
      expect(push.branch).toBe("master");

      expect(push.headers.host).toBe("localhost:" + port);
      expect(push.method).toBe("POST");
      expect(push.url).toBe("/doom/git-receive-pack");

      push.reject(500, "ACCESS DENIED");
    });
  });

  test("create git server via listen() command", (done) => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, '0700');
    fs.mkdirSync(srcDir, '0700');
    fs.mkdirSync(dstDir, '0700');

    const repos = new Git(repoDir);
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    expect(repos.listen(port)).toBe(repos);

    process.chdir(srcDir);
    async.waterfall(
      [
        (callback) => {
          process.chdir(dstDir);
          spawn("git", ["clone", "http://localhost:" + port + "/doom"]).on(
            "exit",
            (code) => {
              expect(code).toBe(0);
              callback();
            }
          );
        },
      ],
      (err) => {
        expect(!err).toBeTruthy();
        repos.close();
        done();
      }
    );
  });

  test(
    "should return promise that resolves when server is closed if no callback specified",
    (done) => {
      const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;

      fs.mkdirSync(repoDir, '0700');

      const repos = new Git(repoDir);
      const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
      repos.listen(port, () => {
        repos.close().then(() => {
          done();
        });
      });
    }
  );

  test("should be able to protect certain routes", (done) => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, '0700');
    fs.mkdirSync(srcDir, '0700');
    fs.mkdirSync(dstDir, '0700');

    const repos = new Git(repoDir, {
      autoCreate: true,
      authenticate: ({ type, repo, user }, next) => {
        if ((type == "download", repo == "doom")) {
          user((username, password) => {
            if (username == "root" && password == "root") {
              next();
            } else {
              next("that is not the correct password");
            }
          });
        } else {
          next("that is not the correct password");
        }
      },
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    repos.listen(port);

    process.chdir(srcDir);
    async.waterfall(
      [
        (callback) => {
          process.chdir(dstDir);
          const clone = spawn("git", [
            "clone",
            `http://root:root@localhost:${port}/doom.git`,
          ]);

          clone.on("close", function (code) {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          process.chdir(dstDir);
          const clone = spawn("git", [
            "clone",
            `http://root:world@localhost:${port}/doom.git doom1`,
          ]);
          let error = "";

          clone.stderr.on("data", (d) => {
            error += d.toString("utf8");
          });

          clone.on("close", function (code) {
            expect(error).toBe(
              `Cloning into \'doom.git doom1\'...\nfatal: unable to access \'http://localhost:${port}/doom.git doom1/\': The requested URL returned error: 400\n`
            );
            expect(code).toBe(128);
            callback();
          });
        },
      ],
      (err) => {
        expect(!err).toBeTruthy();
        repos.close();
        done();
      }
    );
  });

  test("should be able to access headers in authenticate", (done) => {
    expect.assertions(14);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, '0700');
    fs.mkdirSync(srcDir, '0700');
    fs.mkdirSync(dstDir, '0700');

    const repos = new Git(repoDir, {
      autoCreate: true,
      authenticate: ({ type, repo, user, headers }, next) => {
        if ((type == "download", repo == "doom")) {
          expect(headers["host"]).toBeTruthy();
          expect(headers["user-agent"]).toBeTruthy();
          expect(headers["accept"]).toBeTruthy();
          expect(headers["pragma"]).toBeTruthy();
          expect(headers["accept-encoding"]).toBeTruthy();

          user((username, password) => {
            if (username == "root" && password == "root") {
              next();
            } else {
              next("that is not the correct password");
            }
          });
        } else {
          next("that is not the correct password");
        }
      },
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    repos.listen(port);

    process.chdir(srcDir);
    async.waterfall(
      [
        (callback) => {
          process.chdir(dstDir);
          const clone = spawn("git", [
            "clone",
            `http://root:root@localhost:${port}/doom.git`,
          ]);

          clone.on("close", function (code) {
            expect(code).toBe(0);
            callback();
          });
        },
        (callback) => {
          process.chdir(dstDir);
          const clone = spawn("git", [
            "clone",
            `http://root:world@localhost:${port}/doom.git doom1`,
          ]);
          let error = "";

          clone.stderr.on("data", (d) => {
            error += d.toString("utf8");
          });

          clone.on("close", function (code) {
            expect(error).toBe(
              `Cloning into \'doom.git doom1\'...\nfatal: unable to access \'http://localhost:${port}/doom.git doom1/\': The requested URL returned error: 400\n`
            );
            expect(code).toBe(128);
            callback();
          });
        },
      ],
      (err) => {
        expect(!err).toBeTruthy();
        repos.close();
        done();
      }
    );
  });

  test(
    "should be able to protect certain routes with a promised authenticate",
    (done) => {
      const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;
      const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;
      const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;

      fs.mkdirSync(repoDir, '0700');
      fs.mkdirSync(srcDir, '0700');
      fs.mkdirSync(dstDir, '0700');

      const repos = new Git(repoDir, {
        autoCreate: true,
        authenticate: ({ type, repo, user }) => {
          return new Promise(function (resolve, reject) {
            if ((type == "download", repo == "doom")) {
              user((username, password) => {
                if (username == "root" && password == "root") {
                  return resolve();
                } else {
                  return reject("that is not the correct password");
                }
              });
            } else {
              return reject("that is not the correct password");
            }
          });
        },
      });
      const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
      repos.listen(port);

      process.chdir(srcDir);
      async.waterfall(
        [
          (callback) => {
            process.chdir(dstDir);
            const clone = spawn("git", [
              "clone",
              `http://root:root@localhost:${port}/doom.git`,
            ]);

            clone.on("close", function (code) {
              expect(code).toBe(0);
              callback();
            });
          },
          (callback) => {
            process.chdir(dstDir);
            const clone = spawn("git", [
              "clone",
              `http://root:world@localhost:${port}/doom.git doom1`,
            ]);
            let error = "";

            clone.stderr.on("data", (d) => {
              error += d.toString("utf8");
            });

            clone.on("close", function (code) {
              expect(error).toBe(
                `Cloning into \'doom.git doom1\'...\nfatal: unable to access \'http://localhost:${port}/doom.git doom1/\': The requested URL returned error: 400\n`
              );
              expect(code).toBe(128);
              callback();
            });
          },
        ],
        (err) => {
          expect(!err).toBeTruthy();
          repos.close();
          done();
        }
      );
    }
  );

  test(
    "should be able to send custom messages to git client (main stream)",
    () => {
      const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;
      const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;
      const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;

      fs.mkdirSync(repoDir, '0700');
      fs.mkdirSync(srcDir, '0700');
      fs.mkdirSync(dstDir, '0700');

      const repos = new Git(repoDir, {
        autoCreate: true,
      });
      const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;

      repos.on("push", (push) => {
      console.log(`push ${push.repo}/${push.commit}`); // eslint-disable-line
        push.log(" ");
        push.log("Have a great day!");
        push.log(" ");

        push.accept();
      });

      repos.listen(port);

      process.chdir(srcDir);

      async.waterfall(
        [
          (callback) => {
            repos.create("doom", () => {
              callback();
            });
          },
          (callback) => {
            spawn("git", ["init"]).on("exit", (code) => {
              expect(code).toBe(0);
              callback();
            });
          },
          (callback) => {
            fs.writeFile(srcDir + "/a.txt", "abcd", () => {
              callback();
            });
          },
          (callback) => {
            spawn("git", ["add", "a.txt"]).on("exit", (code) => {
              expect(code).toBe(0);
              callback();
            });
          },
          (callback) => {
            spawn("git", ["commit", "-m", "a!!"]).on("exit", () => {
              callback();
            });
          },
          (callback) => {
            const logs = [];
            const push = spawn("git", [
              "push",
              "http://localhost:" + port + "/doom.git",
              "master",
            ]);

            push.stdout.on("data", (data) => {
              if (data.toString() !== "") {
                logs.push(data.toString());
              }
            });

            push.stderr.on("data", (data) => {
              if (data.toString() !== "") {
                logs.push(data.toString());
              }
            });

            push.on("exit", () => {
              expect(logs.join(" ").indexOf("remote: Have a great day!") > -1).toBeTruthy();
              callback();
            });
          },
        ],
        (err) => {
          expect(!err).toBeTruthy();
          repos.close();
          done();
        }
      );
    }
  );

  test(
    "should be able to send custom messages to git client (response stream)",
    (done) => {
      const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;
      const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;
      const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
        16
      )}`;

      fs.mkdirSync(repoDir, '0700');
      fs.mkdirSync(srcDir, '0700');
      fs.mkdirSync(dstDir, '0700');

      const repos = new Git(repoDir, {
        autoCreate: true,
      });
      const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;

      repos.on("push", (push) => {
      console.log(`push ${push.repo}/${push.commit}`); // eslint-disable-line

        push.on("response", (stream) => {
          stream.log(" ");
          stream.log("Have a great day!");
          stream.log(" ");
        });

        push.accept();
      });

      repos.listen(port);

      process.chdir(srcDir);

      async.waterfall(
        [
          (callback) => {
            repos.create("doom", () => {
              callback();
            });
          },
          (callback) => {
            spawn("git", ["init"]).on("exit", (code) => {
              expect(code).toBe(0);
              callback();
            });
          },
          (callback) => {
            fs.writeFile(srcDir + "/a.txt", "abcd", () => {
              callback();
            });
          },
          (callback) => {
            spawn("git", ["add", "a.txt"]).on("exit", (code) => {
              expect(code).toBe(0);
              callback();
            });
          },
          (callback) => {
            spawn("git", ["commit", "-m", "a!!"]).on("exit", () => {
              callback();
            });
          },
          (callback) => {
            const logs = [];
            const push = spawn("git", [
              "push",
              "http://localhost:" + port + "/doom.git",
              "master",
            ]);

            push.stdout.on("data", (data) => {
              if (data.toString() !== "") {
                logs.push(data.toString());
              }
            });

            push.stderr.on("data", (data) => {
              if (data.toString() !== "") {
                logs.push(data.toString());
              }
            });

            push.on("exit", () => {
              expect(logs.join(" ").indexOf("remote: Have a great day!") > -1).toBeTruthy();
              callback();
            });
          },
        ],
        (err) => {
          expect(!err).toBeTruthy();
          repos.close();
          done();
        }
      );
    }
  );
});
