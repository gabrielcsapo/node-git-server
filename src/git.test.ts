import fs from "fs";
import path from "path";
import { spawn, exec, SpawnOptionsWithoutStdio } from "child_process";
import http from "http";

import { Git } from "./git";

jest.setTimeout(10000);

const wrapCallback = (func: { (callback: any): void }) => {
  return new Promise((resolve) => {
    func(resolve);
  });
};

describe("git", () => {
  test("create, push to, and clone a repo", async () => {
    expect.assertions(11);

    let lastCommit: string;

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

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

    repos.on("push", (push) => {
      expect(push.repo).toBe("xyz/doom");
      expect(push.commit).toBe(lastCommit);
      expect(push.branch).toBe("master");

      expect(push.headers.host).toBe("localhost:" + port);
      expect(push.method).toBe("POST");
      expect(push.url).toBe("/xyz/doom/git-receive-pack");

      push.accept();
    });

    await wrapCallback((callback: () => void) => {
      repos.mkdir("xyz");
      callback();
    });

    await wrapCallback((callback: () => void) => {
      repos.create("xyz/doom", () => {
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["init"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });

    await wrapCallback((callback: () => void) => {
      fs.writeFile(srcDir + "/a.txt", "abcd", () => {
        callback();
      });
    });

    await wrapCallback((callback: () => void) => {
      spawn("git", ["add", "a.txt"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["commit", "-am", "a!!"]).on("exit", () => {
        exec("git log | head -n1", (err, stdout) => {
          lastCommit = stdout.split(/\s+/)[1];
          callback();
        });
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", [
        "push",
        "http://localhost:" + port + "/xyz/doom",
        "master",
      ]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      process.chdir(dstDir);
      spawn("git", ["clone", "http://localhost:" + port + "/xyz/doom"]).on(
        "exit",
        (code) => {
          expect(code).toBe(0);
          callback();
        }
      );
    });
    await wrapCallback((callback: () => void) => {
      fs.exists(dstDir + "/doom/a.txt", (ex) => {
        expect(ex).toBeTruthy();
        callback();
      });
    });

    server.close();
  });

  test("create, push to, and clone a repo successful", async () => {
    expect.assertions(8);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

    const repos = new Git(repoDir);
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
      repos.handle(req, res);
    });
    server.listen(port);

    repos.on("push", (push) => {
      expect(push.repo).toBe("doom");
      push.accept();
    });

    process.chdir(srcDir);

    await wrapCallback((callback: () => void) => {
      spawn("git", ["init"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      fs.writeFile(srcDir + "/a.txt", "abcd", (err) => {
        expect(!err).toBeTruthy();
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["add", "a.txt"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["commit", "-am", "a!!"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["push", "http://localhost:" + port + "/doom", "master"]).on(
        "exit",
        (code) => {
          expect(code).toBe(0);
          callback();
        }
      );
    });
    await wrapCallback((callback: () => void) => {
      process.chdir(dstDir);
      spawn("git", ["clone", "http://localhost:" + port + "/doom"]).on(
        "exit",
        (code) => {
          expect(code).toBe(0);
          callback();
        }
      );
    });
    await wrapCallback((callback: () => void) => {
      fs.stat(dstDir + "/doom/a.txt", (ex) => {
        expect(!ex).toBeTruthy();
        callback();
      });
    });

    server.close();
  });

  test("clone into programatic directories", async () => {
    expect.assertions(19);

    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const targetDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");
    fs.mkdirSync(targetDir, "0700");

    const server = new Git((dir?: string) => {
      expect(dir).toBe("doom.git");

      return path.join(targetDir, dir || "");
    });

    server.listen(port);

    server.on("push", (push) => {
      expect(push.repo).toBe("doom.git");
      push.accept();
    });

    process.chdir(srcDir);
    await wrapCallback((callback: () => void) => {
      spawn("git", ["init"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      fs.writeFile(srcDir + "/a.txt", "abcd", (err) => {
        expect(!err).toBeTruthy();
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["add", "a.txt"], {
        cwd: srcDir,
      }).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["commit", "-am", "a!!"], {
        cwd: srcDir,
      }).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
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
    });
    await wrapCallback((callback: () => void) => {
      process.chdir(dstDir);
      spawn("git", ["clone", "http://localhost:" + port + "/doom.git"]).on(
        "exit",
        (code) => {
          expect(code).toBe(0);
          callback();
        }
      );
    });
    await wrapCallback((callback: () => void) => {
      fs.stat(dstDir + "/doom/a.txt", (ex) => {
        expect(!ex).toBeTruthy();
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      fs.stat(targetDir + "/doom.git/HEAD", (ex) => {
        expect(!ex).toBeTruthy();
        callback();
      });
    });

    server.close();
  });

  test("test tagging", async () => {
    expect.assertions(27);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    let lastCommit: string;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

    const repos = new Git(repoDir, {
      autoCreate: true,
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
      repos.handle(req, res);
    });
    server.listen(port);

    repos.on("push", (push) => {
      expect(push.repo).toBe("doom");
      expect(push.commit).toBe(lastCommit);
      expect(push.branch).toBe("master");

      expect(push.headers.host).toBe("localhost:" + port);
      expect(push.method).toBe("POST");
      expect(push.url).toBe("/doom/git-receive-pack");

      push.accept();
    });

    let firstTag = true;
    repos.on("tag", (tag) => {
      expect(tag.repo).toBe("doom");
      expect(tag.version).toBe("0.0." + (firstTag ? 1 : 2));

      expect(tag.headers.host).toBe("localhost:" + port);
      expect(tag.method).toBe("POST");
      expect(tag.url).toBe("/doom/git-receive-pack");

      tag.accept();
      firstTag = false;
    });

    process.chdir(srcDir);
    await wrapCallback((callback: () => void) => {
      repos.create("doom", () => {
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["init"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      fs.writeFile(srcDir + "/a.txt", "abcd", (err) => {
        expect(!err).toBeTruthy();
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["add", "a.txt"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["commit", "-am", "a!!"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["tag", "0.0.1"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      fs.writeFile(srcDir + "/a.txt", "efgh", (err) => {
        expect(!err).toBeTruthy();
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["add", "a.txt"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["commit", "-am", "a!!"]).on("exit", () => {
        exec("git log | head -n1", (err, stdout) => {
          lastCommit = stdout.split(/\s+/)[1];
          callback();
        });
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["tag", "0.0.2"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", [
        "push",
        "--tags",
        "http://localhost:" + port + "/doom",
        "master",
      ]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      process.chdir(dstDir);
      spawn("git", ["clone", "http://localhost:" + port + "/doom"]).on(
        "exit",
        (code) => {
          expect(code).toBe(0);
          callback();
        }
      );
    });
    await wrapCallback((callback: () => void) => {
      fs.exists(dstDir + "/doom/a.txt", (ex) => {
        expect(ex).toBeTruthy();
        callback();
      });
    });
    server.close();
  });

  describe("repos list", () => {
    const workingRepoDir = path.resolve(
      __dirname,
      "..",
      "fixtures",
      "server",
      "tmp"
    );
    const notWorkingRepoDir = path.resolve(
      __dirname,
      "..",
      "fixtures",
      "server",
      "temp"
    );

    test("should return back with one directory in server", (done: () => void) => {
      jest.setTimeout(15000);

      expect.assertions(2);

      const repos = new Git(workingRepoDir, {
        autoCreate: true,
      });

      repos.list((err, results) => {
        expect(err).toBeFalsy();
        expect(["test.git"]).toEqual(results);
        done();
      });
    });

    test("should return back error directory does not exist", (done: () => void) => {
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

  test("create, push to, and clone a repo reject", async () => {
    expect.assertions(12);

    function _spawn(
      cmd: string,
      args: any[] | readonly string[] | undefined,
      opts: SpawnOptionsWithoutStdio | undefined
    ) {
      const ps = spawn(cmd, args, opts);
      ps.on("error", (err) => {
        console.error( // eslint-disable-line
          err.message + " while executing: " + cmd + " " + args?.join(" ")
        );
      });
      return ps;
    }

    let lastCommit: string;

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

    const repos = new Git(repoDir, {
      autoCreate: true,
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    const server = http.createServer((req, res) => {
      repos.handle(req, res);
    });
    server.listen(port);

    process.chdir(srcDir);

    repos.on("push", (push) => {
      expect(push.repo).toBe("doom");
      expect(push.commit).toBe(lastCommit);
      expect(push.branch).toBe("master");

      expect(push.headers.host).toBe("localhost:" + port);
      expect(push.method).toBe("POST");
      expect(push.url).toBe("/doom/git-receive-pack");

      push.reject(500, "ACCESS DENIED");
    });

    await wrapCallback((callback: () => void) => {
      repos.create("doom", () => {
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      _spawn("git", ["init"], {}).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      fs.writeFile(srcDir + "/a.txt", "abcd", (err) => {
        expect(!err).toBeTruthy();
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      _spawn("git", ["add", "a.txt"], {}).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      _spawn("git", ["commit", "-am", "a!!"], {}).on("exit", () => {
        exec("git log | head -n1", (err, stdout) => {
          lastCommit = stdout.split(/\s+/)[1];
          callback();
        });
      });
    });
    await wrapCallback((callback: () => void) => {
      _spawn(
        "git",
        ["push", "http://localhost:" + port + "/doom", "master"],
        {}
      ).on("exit", (code) => {
        expect(code).not.toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      const glog = _spawn("git", ["log"], {
        cwd: repoDir + "/doom.git",
      });
      glog.on("exit", (code) => {
        expect(code).toBe(128);
        callback();
      });
      let data = "";
      glog.stderr.on("data", (buf) => (data += buf));
      glog.stderr.on("end", () => {
        const res =
          /fatal: bad default revision 'HEAD'/.test(data) ||
          /fatal: your current branch 'master' does not have any commits yet/.test(
            data
          );
        expect(res).toBeTruthy();
      });
    });
    server.close();
  });

  test("create git server via listen() command", async () => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

    const repos = new Git(repoDir);
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    expect(repos.listen(port)).toBe(repos);

    process.chdir(srcDir);
    await wrapCallback((callback: () => void) => {
      process.chdir(dstDir);
      spawn("git", ["clone", "http://localhost:" + port + "/doom"]).on(
        "exit",
        (code) => {
          expect(code).toBe(0);
          callback();
        }
      );
    });
    repos.close();
  });

  test("should return promise that resolves when server is closed if no callback specified", (done: () => void) => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;

    fs.mkdirSync(repoDir, "0700");

    const repos = new Git(repoDir);
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    repos.listen(port, undefined, () => {
      repos.close().then(() => {
        done();
      });
    });
  });

  test("should be able to protect certain routes", async () => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

    const repos = new Git(repoDir, {
      autoCreate: true,
      authenticate: ({ type, repo, user }, next) => {
        if (type === "fetch" && repo === "doom") {
          user((username, password) => {
            if (username == "root" && password == "root") {
              next();
            } else {
              next(new Error("that is not the correct password"));
            }
          });
        } else {
          next(new Error("that is not the correct password"));
        }
      },
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    repos.listen(port);

    process.chdir(srcDir);
    await wrapCallback((callback: () => void) => {
      process.chdir(dstDir);
      const clone = spawn("git", [
        "clone",
        `http://root:root@localhost:${port}/doom.git`,
      ]);

      clone.on("close", function (code) {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
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
          `Cloning into 'doom.git doom1'...\nfatal: unable to access 'http://localhost:${port}/doom.git doom1/': The requested URL returned error: 400\n`
        );
        expect(code).toBe(128);
        callback();
      });
    });
    repos.close();
  });

  test("should be able to access headers in authenticate", async () => {
    expect.assertions(13);

    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

    const repos = new Git(repoDir, {
      autoCreate: true,
      authenticate: ({ type, repo, user, headers }, next) => {
        if (type === "fetch" && repo === "doom") {
          expect(headers["host"]).toBeTruthy();
          expect(headers["user-agent"]).toBeTruthy();
          expect(headers["accept"]).toBeTruthy();
          expect(headers["pragma"]).toBeTruthy();
          expect(headers["accept-encoding"]).toBeTruthy();

          user((username, password) => {
            if (username == "root" && password == "root") {
              next();
            } else {
              next(new Error("that is not the correct password"));
            }
          });
        } else {
          next(new Error("that is not the correct password"));
        }
      },
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;
    repos.listen(port);

    process.chdir(srcDir);
    await wrapCallback((callback: () => void) => {
      process.chdir(dstDir);
      const clone = spawn("git", [
        "clone",
        `http://root:root@localhost:${port}/doom.git`,
      ]);

      clone.on("close", function (code) {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
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
          `Cloning into 'doom.git doom1'...\nfatal: unable to access 'http://localhost:${port}/doom.git doom1/': The requested URL returned error: 400\n`
        );
        expect(code).toBe(128);
        callback();
      });
    });
    repos.close();
  });

  test("should be able to protect certain routes with a promised authenticate", async () => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

    const repos = new Git(repoDir, {
      autoCreate: true,
      authenticate: ({ type, repo, user }) => {
        return new Promise(function (resolve, reject) {
          if (type === "fetch" && repo === "doom") {
            user((username, password) => {
              if (username == "root" && password == "root") {
                return resolve("");
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
    await wrapCallback((callback: () => void) => {
      process.chdir(dstDir);
      const clone = spawn("git", [
        "clone",
        `http://root:root@localhost:${port}/doom.git`,
      ]);

      clone.on("close", function (code) {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
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
          `Cloning into 'doom.git doom1'...\nfatal: unable to access 'http://localhost:${port}/doom.git doom1/': The requested URL returned error: 400\n`
        );
        expect(code).toBe(128);
        callback();
      });
    });
    repos.close();
  });

  test("should be able to send custom messages to git client (main stream)", async () => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

    const repos = new Git(repoDir, {
      autoCreate: true,
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;

    repos.on("push", (push) => {
      push.log(" ");
      push.log("Have a great day!");
      push.log(" ");

      push.accept();
    });

    repos.listen(port);

    process.chdir(srcDir);

    await wrapCallback((callback: () => void) => {
      repos.create("doom", () => {
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["init"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      fs.writeFile(srcDir + "/a.txt", "abcd", () => {
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["add", "a.txt"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["commit", "-m", "a!!"]).on("exit", () => {
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      const logs: any[] = [];
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
        expect(
          logs.join(" ").indexOf("remote: Have a great day!") > -1
        ).toBeTruthy();
        callback();
      });
    });

    repos.close();
  });

  test("should be able to send custom messages to git client (response stream)", async () => {
    const repoDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(
      16
    )}`;
    const srcDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;
    const dstDir = `/tmp/${Math.floor(Math.random() * (1 << 30)).toString(16)}`;

    fs.mkdirSync(repoDir, "0700");
    fs.mkdirSync(srcDir, "0700");
    fs.mkdirSync(dstDir, "0700");

    const repos = new Git(repoDir, {
      autoCreate: true,
    });
    const port = Math.floor(Math.random() * ((1 << 16) - 1e4)) + 1e4;

    repos.on("push", (push) => {
        console.log(`push ${push.repo}/${push.commit}`); // eslint-disable-line

      push.on("response", (stream: { log: (arg0: string) => void }) => {
        stream.log(" ");
        stream.log("Have a great day!");
        stream.log(" ");
      });

      push.accept();
    });

    repos.listen(port);

    process.chdir(srcDir);

    await wrapCallback((callback: () => void) => {
      repos.create("doom", () => {
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["init"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      fs.writeFile(srcDir + "/a.txt", "abcd", () => {
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["add", "a.txt"]).on("exit", (code) => {
        expect(code).toBe(0);
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      spawn("git", ["commit", "-m", "a!!"]).on("exit", () => {
        callback();
      });
    });
    await wrapCallback((callback: () => void) => {
      const logs: any[] = [];
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
        expect(
          logs.join(" ").indexOf("remote: Have a great day!") > -1
        ).toBeTruthy();
        callback();
      });
    });
    repos.close();
  });
});
