import fs from "fs";

import path from "path";
import http, { ServerOptions } from "http";
import https from "https";
import url from "url";
import qs from "querystring";
import { HttpDuplex } from "./http-duplex";

import { spawn } from "child_process";
import { EventEmitter } from "events";

import {
  parseGitName,
  createAction,
  infoResponse,
  onExit,
  basicAuth,
  noCache,
} from "./util";
import { ServiceString } from "./types";

const services = ["upload-pack", "receive-pack"];

interface GitServerOptions extends ServerOptions {
  type: "http" | "https";
}

/**
  * @event Git#push
  * @type {Object}
  * @property {HttpDuplex} push - is a http duplex object (see below) with these extra properties
  * @property {String} push.repo - the string that defines the repo
  * @property {String} push.commit - the string that defines the commit sha
  * @property {String} push.branch - the string that defines the branch
  * @example
    repos.on('push', function (push) { ... }

    Emitted when somebody does a `git push` to the repo.

    Exactly one listener must call `push.accept()` or `push.reject()`. If there are
    no listeners, `push.accept()` is called automatically.
  *
**/

/**
  * @event Git#tag
  * @type {Object}
  * @property {HttpDuplex} tag - an http duplex object (see below) with these extra properties:
  * @property {String} tag.repo - the string that defines the repo
  * @property {String} tag.commit - the string that defines the commit sha
  * @property {String} tag.version - the string that defines the tag being pushed
  * @example
    repos.on('tag', function (tag) { ... }

    Emitted when somebody does a `git push --tags` to the repo.
    Exactly one listener must call `tag.accept()` or `tag.reject()`. If there are
    No listeners, `tag.accept()` is called automatically.
  *
**/

/**
  * @event Git#fetch
  * @type {Object}
  * @property {HttpDuplex} fetch - an http duplex object (see below) with these extra properties:
  * @property {String} fetch.repo - the string that defines the repo
  * @property {String} fetch.commit - the string that defines the commit sha
  * @example
    repos.on('fetch', function (fetch) { ... }

    Emitted when somebody does a `git fetch` to the repo (which happens whenever you
    do a `git pull` or a `git clone`).

    Exactly one listener must call `fetch.accept()` or `fetch.reject()`. If there are
    no listeners, `fetch.accept()` is called automatically.
  *
*/

/**
  * @event Git#info
  * @type {Object}
  * @property {HttpDuplex} info - an http duplex object (see below) with these extra properties:
  * @property {String} info.repo - the string that defines the repo
  * @example
    repos.on('info', function (info) { ... }

    Emitted when the repo is queried for info before doing other commands.

    Exactly one listener must call `info.accept()` or `info.reject()`. If there are
    no listeners, `info.accept()` is called automatically.
  *
*/

/**
  * @event Git#info
  * @type {Object}
  * @property {HttpDuplex} info - an http duplex object (see below) with these extra properties:
  * @property {String} info.repo - the string that defines the repo
  * @example
    repos.on('info', function (info) { ... }

    Emitted when the repo is queried for info before doing other commands.

    Exactly one listener must call `info.accept()` or `info.reject()`. If there are
    no listeners, `info.accept()` is called automatically.
  *
*/

/**
  * @event Git#head
  * @type {Object}
  * @property {HttpDuplex} head - an http duplex object (see below) with these extra properties:
  * @property {String} head.repo - the string that defines the repo
  * @example
    repos.on('head', function (head) { ... }

    Emitted when the repo is queried for HEAD before doing other commands.

    Exactly one listener must call `head.accept()` or `head.reject()`. If there are
    no listeners, `head.accept()` is called automatically.
  *
*/

export interface GitOptions {
  autoCreate?: boolean;
  authenticate?: (
    options: GitAuthenticateOptions,
    callback: (error: Error) => void | undefined
  ) => Promise<any> | undefined;
  checkout?: boolean;
}

export interface GitAuthenticateOptions {
  type: string;
  repo: string;
  user: (
    callback: (
      username?: string | undefined,
      password?: string | undefined
    ) => void
  ) => void;
  headers: http.IncomingHttpHeaders;
}

export class Git extends EventEmitter {
  dirMap: (dir?: string) => string;

  authenticate:
    | ((
        options: GitAuthenticateOptions,
        callback: (error: Error) => void | undefined
      ) => Promise<any> | undefined)
    | undefined;

  autoCreate: boolean;
  checkout: boolean | undefined;
  server: https.Server | http.Server | undefined;

  /**
   *
   * Handles invoking the git-*-pack binaries
   * @param  repoDir   - Create a new repository collection from the directory `repoDir`. `repoDir` should be entirely empty except for git repo directories. If `repoDir` is a function, `repoDir(repo)` will be used to dynamically resolve project directories. The return value of `repoDir(repo)` should be a string path specifying where to put the string `repo`. Make sure to return the same value for `repo` every time since `repoDir(repo)` will be called multiple times.
   * @param  options - options that can be applied on the new instance being created
   * @param  options.autoCreate - By default, repository targets will be created if they don't exist. You can
   disable that behavior with `options.autoCreate = true`
   * @param  options.authenticate - a function that has the following arguments ({ type, repo, username, password, headers }, next) and will be called when a request comes through if set
   *
     authenticate: ({ type, repo, username, password, headers }, next) => {
       console.log(type, repo, username, password);
       next();
     }
     // alternatively you can also pass authenticate a promise
     authenticate: ({ type, repo, username, password, headers }, next) => {
       console.log(type, repo, username, password);
       return new Promise((resolve, reject) => {
        if(username === 'foo') {
          return resolve();
        }
        return reject("sorry you don't have access to this content");
       });
     }
   * @param  options.checkout - If `opts.checkout` is true, create and expected checked-out repos instead of bare repos
  */
  constructor(repoDir: string, options: GitOptions = {}) {
    super();

    if (typeof repoDir === "function") {
      this.dirMap = repoDir;
    } else {
      this.dirMap = (dir?: string): string => {
        return path.normalize(
          (dir ? path.join(repoDir, dir) : repoDir) as string
        );
      };
    }

    if (options.authenticate) {
      this.authenticate = options.authenticate;
    }

    this.autoCreate = options.autoCreate === false ? false : true;
    this.checkout = options.checkout;
  }
  /**
   * Get a list of all the repositories
   * @param  {Function} callback function to be called when repositories have been found `function(error, repos)`
   */
  list(callback: (error: Error | undefined, repos?: string[]) => void) {
    fs.readdir(this.dirMap(), (error, results) => {
      if (error) return callback(error);
      const repos = results.filter((r) => {
        return r.substring(r.length - 3, r.length) == "git";
      }, []);

      callback(undefined, repos);
    });
  }
  /**
   * Find out whether `repoName` exists in the callback `cb(exists)`.
   * @param  repo - name of the repo
   * @param  callback - function to be called when finished
   */
  exists(repo: string, callback: (exists: boolean) => void) {
    fs.exists(this.dirMap(repo), callback);
  }
  /**
   * Create a subdirectory `dir` in the repo dir with a callback.
   * @param  dir - directory name
   * @param  callback  - callback to be called when finished
   */
  mkdir(dir: string, callback: () => void) {
    // TODO: remove sync operations
    const parts = this.dirMap(dir).split(path.sep);
    for (let i = 0; i <= parts.length; i++) {
      const directory = parts.slice(0, i).join(path.sep);
      if (directory && !fs.existsSync(directory)) {
        fs.mkdirSync(directory);
      }
    }
    callback();
  }
  /**
   * Create a new bare repository `repoName` in the instance repository directory.
   * @param  repo - the name of the repo
   * @param  callback - Optionally get a callback `cb(err)` to be notified when the repository was created.
   */
  create(repo: string, callback: (error?: Error) => void) {
    function next(self: Git) {
      let ps;
      let _error = "";

      const dir = self.dirMap(repo);

      if (self.checkout) {
        ps = spawn("git", ["init", dir]);
      } else {
        ps = spawn("git", ["init", "--bare", dir]);
      }

      ps.stderr.on("data", function (chunk: string) {
        _error += chunk;
      });

      onExit(ps, function (code: number) {
        if (!callback) {
          return;
        } else if (code) callback(new Error(_error));
        else callback();
      });
    }

    if (typeof callback !== "function")
      callback = () => {
        return;
      };

    if (!/\.git$/.test(repo)) repo += ".git";

    this.exists(repo, (ex) => {
      if (!ex) {
        this.mkdir(repo, () => {
          next(this);
        });
      } else {
        next(this);
      }
    });
  }
  /**
   * returns the typeof service being process
   * @method getType
   * @param  {String} service - the service type
   * @return {String}  - will respond with either fetch or push
   */
  getType(service: string) {
    switch (service) {
      case "upload-pack":
        return "fetch";
      case "receive-pack":
        return "push";
      default:
        return "unknown";
    }
  }

  /**
   * Handle incoming HTTP requests with a connect-style middleware
   * @method handle
   * @memberof Git
   * @param  req - http request object
   * @param  res - http response object
   */
  handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const handlers = [
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (req.method !== "GET") return false;

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const u = url.parse(req?.url || "");
        const m = u.pathname?.match(/\/(.+)\/info\/refs$/);
        if (!m) return false;
        if (/\.\./.test(m[1])) return false;

        const repo = m[1];
        const params = qs.parse(u?.query || "");
        if (!params.service || typeof params.service !== "string") {
          res.statusCode = 400;
          res.end("service parameter required");
          return;
        }

        const service = params.service.replace(/^git-/, "");

        if (services.indexOf(service) < 0) {
          res.statusCode = 405;
          res.end("service not available");
          return;
        }

        const repoName = parseGitName(m[1]);
        const next = (error?: Error) => {
          if (error) {
            res.setHeader("Content-Type", "text/plain");
            res.setHeader(
              "WWW-Authenticate",
              'Basic realm="authorization needed"'
            );
            res.writeHead(401);
            res.end(typeof error === "string" ? error : error.toString());
            return;
          } else {
            return infoResponse(this, repo, service as ServiceString, req, res);
          }
        };

        // check if the repo is authenticated
        if (this.authenticate) {
          const type = this.getType(service);
          const headers = req.headers;
          const user = basicAuth.bind(null, req, res);
          const promise = this.authenticate(
            { type, repo: repoName, user, headers },
            (error: Error) => {
              return next(error);
            }
          );

          if (promise instanceof Promise) {
            return promise.then(next).catch(next);
          }
        } else {
          return next();
        }
      },
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (req.method !== "GET") return false;

        const u = url.parse(req.url || "");
        const m = u.pathname?.match(/^\/(.+)\/HEAD$/);
        if (!m) return false;
        if (/\.\./.test(m[1])) return false;

        const repo = m[1];

        const next = () => {
          const file = this.dirMap(path.join(m[1], "HEAD"));
          this.exists(file, (exists) => {
            if (exists) {
              fs.createReadStream(file).pipe(res);
            } else {
              res.statusCode = 404;
              res.end("not found");
            }
          });
        };

        this.exists(repo, (exists) => {
          const anyListeners = self.listeners("head").length > 0;
          const dup = new HttpDuplex(req, res);
          dup.exists = exists;
          dup.repo = repo;
          dup.cwd = this.dirMap(repo);

          dup.accept = dup.emit.bind(dup, "accept");
          dup.reject = dup.emit.bind(dup, "reject");

          dup.once("reject", (code: number) => {
            dup.statusCode = code || 500;
            dup.end();
          });

          if (!exists && self.autoCreate) {
            dup.once("accept", (dir: string) => {
              self.create(dir || repo, next);
            });
            self.emit("head", dup);
            if (!anyListeners) dup.accept();
          } else if (!exists) {
            res.statusCode = 404;
            res.setHeader("content-type", "text/plain");
            res.end("repository not found");
          } else {
            dup.once("accept", next);
            self.emit("head", dup);
            if (!anyListeners) dup.accept();
          }
        });
      },
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (req.method !== "POST") return false;
        const m = req.url?.match(/\/(.+)\/git-(.+)/);
        if (!m) return false;
        if (/\.\./.test(m[1])) return false;

        const repo = m[1],
          service = m[2];

        if (services.indexOf(service) < 0) {
          res.statusCode = 405;
          res.end("service not available");
          return;
        }

        res.setHeader(
          "content-type",
          "application/x-git-" + service + "-result"
        );
        noCache(res);

        const action = createAction(
          {
            repo: repo,
            service: service as ServiceString,
            cwd: self.dirMap(repo),
          },
          req,
          res
        );

        action.on("header", () => {
          const evName = action.evName;
          if (evName) {
            const anyListeners = self.listeners(evName).length > 0;
            self.emit(evName, action);
            if (!anyListeners) action.accept();
          }
        });
      },
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (req.method !== "GET" && req.method !== "POST") {
          res.statusCode = 405;
          res.end("method not supported");
        } else {
          return false;
        }
      },
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        res.statusCode = 404;
        res.end("not found");
      },
    ];
    res.setHeader("connection", "close");
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    (function next(ix) {
      const x = handlers[ix].call(self, req, res);
      if (x === false) next(ix + 1);
    })(0);
  }
  /**
   * starts a git server on the given port
   * @method listen
   * @memberof Git
   * @param  port  - the port to start the server on
   * @param  {Object=}   options  - the options to add extended functionality to the server
   * @param  {String=}   options.type - this is either https or http (the default is http)
   * @param  {Buffer|String=}   options.key - the key file for the https server
   * @param  {Buffer|String=}   options.cert - the cert file for the https server
   * @param  {Function} callback - the function to call when server is started or error has occured
   * @return {Git}  - the Git instance, useful for chaining
   */
  listen(port: number, options: GitServerOptions, callback: () => void) {
    if (typeof options == "function" || !options) {
      callback = options;
      options = { type: "http" };
    }
    const createServer =
      options.type == "http"
        ? http.createServer
        : https.createServer.bind(this, options);

    this.server = createServer((req, res) => {
      this.handle(req, res);
    });

    this.server.listen(port, callback);
    return this;
  }
  /**
   * closes the server instance
   * @method close
   * @memberof Git
   * @param {Promise} - will resolve or reject when the server closes or fails to close.
   */
  close() {
    return new Promise((resolve, reject) => {
      this.server?.close((err) => {
        err ? reject(err) : resolve("Success");
      });
    });
  }
}
