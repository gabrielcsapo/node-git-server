import fs from 'fs';

import path from 'path';
import http, { ServerOptions } from 'http';
import https from 'https';
import url from 'url';
import qs from 'querystring';
import { HttpDuplex } from './http-duplex';

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

import {
  parseGitName,
  createAction,
  infoResponse,
  basicAuth,
  noCache,
} from './util';
import { ServiceString } from './types';

const services = ['upload-pack', 'receive-pack'];

interface GitServerOptions extends ServerOptions {
  type: 'http' | 'https';
}

export interface GitOptions<T = undefined> {
  autoCreate?: boolean;
  authenticate?: (options: GitAuthenticateOptions) => Promise<T> | T;
  checkout?: boolean;
}

export interface GitAuthenticateOptions {
  type: string;
  repo: string;
  user: (() => Promise<[string | undefined, string | undefined]>) &
    ((
      callback: (
        username?: string | undefined,
        password?: string | undefined
      ) => void
    ) => void);
  headers: http.IncomingHttpHeaders;
}

/**
 * An http duplex object (see below) with these extra properties:
 */
export interface TagData<T = any> extends HttpDuplex {
  repo: string; // The string that defines the repo
  commit: string; // The string that defines the commit sha
  version: string; // The string that defines the tag being pushed
  context?: T;
}

/**
 * Is a http duplex object (see below) with these extra properties
 */
export interface PushData<T = any> extends HttpDuplex {
  repo: string; // The string that defines the repo
  commit: string; // The string that defines the commit sha
  branch: string; // The string that defines the branch
  context?: T;
}

/**
 * an http duplex object (see below) with these extra properties
 */
export interface FetchData<T = any> extends HttpDuplex {
  repo: string; // The string that defines the repo
  commit: string; //  The string that defines the commit sha
  context?: T;
}

/**
 * an http duplex object (see below) with these extra properties
 */
export interface InfoData<T = any> extends HttpDuplex {
  repo: string; // The string that defines the repo
  context?: T;
}

/**
 * an http duplex object (see below) with these extra properties
 */
export interface HeadData<T = any> extends HttpDuplex {
  repo: string; // The string that defines the repo
  context?: T;
}

export interface GitEvents<T = any> {
  /**
   * @example
   * repos.on('push', function (push) { ... }
   *
   * Emitted when somebody does a `git push` to the repo.
   *
   * Exactly one listener must call `push.accept()` or `push.reject()`. If there are
   * no listeners, `push.accept()` is called automatically.
   **/
  on(event: 'push', listener: (push: PushData<T>) => void): this;

  /**
   * @example
   * repos.on('tag', function (tag) { ... }
   *
   * Emitted when somebody does a `git push --tags` to the repo.
   * Exactly one listener must call `tag.accept()` or `tag.reject()`. If there are
   * No listeners, `tag.accept()` is called automatically.
   **/
  on(event: 'tag', listener: (tag: TagData<T>) => void): this;

  /**
   * @example
   * repos.on('fetch', function (fetch) { ... }
   *
   * Emitted when somebody does a `git fetch` to the repo (which happens whenever you
   * do a `git pull` or a `git clone`).
   *
   * Exactly one listener must call `fetch.accept()` or `fetch.reject()`. If there are
   * no listeners, `fetch.accept()` is called automatically.
   **/
  on(event: 'fetch', listener: (fetch: FetchData<T>) => void): this;

  /**
   * @example
   * repos.on('info', function (info) { ... }
   *
   * Emitted when the repo is queried for info before doing other commands.
   *
   * Exactly one listener must call `info.accept()` or `info.reject()`. If there are
   * no listeners, `info.accept()` is called automatically.
   **/
  on(event: 'info', listener: (info: InfoData<T>) => void): this;

  /**
   * @example
   * repos.on('head', function (head) { ... }
   *
   * Emitted when the repo is queried for HEAD before doing other commands.
   *
   * Exactly one listener must call `head.accept()` or `head.reject()`. If there are
   * no listeners, `head.accept()` is called automatically.
   *
   **/
  on(event: 'head', listener: (head: HeadData<T>) => void): this;
}
export class Git<T = any> extends EventEmitter implements GitEvents {
  dirMap: (dir?: string) => string;

  authenticate:
    | ((options: GitAuthenticateOptions) => Promise<T> | T)
    | undefined = undefined;

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
  constructor(
    repoDir: string | ((dir?: string) => string),
    options: GitOptions<T> = {}
  ) {
    super();

    if (typeof repoDir === 'function') {
      this.dirMap = repoDir;
    } else {
      this.dirMap = (dir?: string): string => {
        return path.normalize(
          (dir ? path.join(repoDir, dir) : repoDir) as string
        );
      };
    }

    this.authenticate = options.authenticate;

    this.autoCreate = options.autoCreate === false ? false : true;
    this.checkout = options.checkout;
  }
  /**
   * Get a list of all the repositories
   * @param  {Function} callback function to be called when repositories have been found `function(error, repos)`
   */
  list(callback: (error: Error | undefined, repos?: string[]) => void): void;
  list(): Promise<string[]>;
  list(
    callback?: (error: Error | undefined, repos?: string[]) => void
  ): Promise<string[]> | void {
    const execf = (res: (repos: string[]) => void, rej: (err: Error) => void) =>
      fs.readdir(this.dirMap(), (error, results) => {
        if (error) return rej(error);
        const repos = results.filter((r) => {
          return r.substring(r.length - 3, r.length) == 'git';
        }, []);

        res(repos);
      });
    if (callback)
      return execf(
        (repos) => callback(void 0, repos),
        (err) => callback(err, void 0)
      );
    else return new Promise<string[]>((res, rej) => execf(res, rej));
  }
  /**
   * Find out whether `repoName` exists in the callback `cb(exists)`.
   * @param  repo - name of the repo
   * @param  callback - function to be called when finished
   */
  exists(repo: string): boolean {
    return fs.existsSync(this.dirMap(repo));
  }
  /**
   * Create a subdirectory `dir` in the repo dir with a callback.
   * @param  dir - directory name
   * @param  callback  - callback to be called when finished
   */
  mkdir(dir: string) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
  }
  /**
   * Create a new bare repository `repoName` in the instance repository directory.
   * @param  repo - the name of the repo
   * @param  callback - Optionally get a callback `cb(err)` to be notified when the repository was created.
   */
  create(repo: string, callback: (error?: Error) => void) {
    const next = () => {
      let ps;
      let _error = '';

      const dir = this.dirMap(repo);

      if (this.checkout) {
        ps = spawn('git', ['init', dir]);
      } else {
        ps = spawn('git', ['init', '--bare', dir]);
      }

      ps.stderr.on('data', function (chunk: string) {
        _error += chunk;
      });

      ps.on('exit', (code) => {
        if (!callback) {
          return;
        } else if (code) {
          callback(new Error(_error));
        } else {
          callback();
        }
      });
    };

    if (typeof callback !== 'function')
      callback = () => {
        return;
      };

    if (!/\.git$/.test(repo)) repo += '.git';

    const exists = this.exists(repo);

    if (!exists) {
      this.mkdir(repo);
    }

    next();
  }
  /**
   * returns the typeof service being process. This will respond with either fetch or push.
   * @param  service - the service type
   */
  getType(service: string): string {
    switch (service) {
      case 'upload-pack':
        return 'fetch';
      case 'receive-pack':
        return 'push';
      default:
        return 'unknown';
    }
  }

  /**
   * Handle incoming HTTP requests with a connect-style middleware
   * @param  http request object
   * @param  http response object
   */
  handle(req: http.IncomingMessage, res: http.ServerResponse) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    let context: T | undefined = undefined;

    const handlers = [
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (req.method !== 'GET') return false;

        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const u = url.parse(req?.url || '');
        const m = u.pathname?.match(/\/(.+)\/info\/refs$/);
        if (!m) return false;
        if (/\.\./.test(m[1])) return false;

        const repo = m[1];
        const params = qs.parse(u?.query || '');
        if (!params.service || typeof params.service !== 'string') {
          res.statusCode = 400;
          res.end('service parameter required');
          return;
        }

        const service = params.service.replace(/^git-/, '');

        if (services.indexOf(service) < 0) {
          res.statusCode = 405;
          res.end('service not available');
          return;
        }

        const repoName = parseGitName(m[1]);
        const next = (error?: Error | void) => {
          if (error) {
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader(
              'WWW-Authenticate',
              'Basic realm="authorization needed"'
            );
            res.writeHead(401);
            res.end(typeof error === 'string' ? error : error.toString());
            return;
          } else {
            return infoResponse(this, repo, service as ServiceString, req, res);
          }
        };

        // check if the repo is authenticated
        if (this.authenticate) {
          const type = this.getType(service);
          const headers = req.headers;
          const user = (
            callback?: (username?: string, password?: string) => void
          ) => {
            const basicAuthResult = basicAuth(req, res);
            if (basicAuthResult && callback) {
              callback(...basicAuthResult);
            }
            if (basicAuthResult) {
              return new Promise<[string | undefined, string | undefined]>(
                (resolve) => resolve(basicAuthResult)
              );
            }
            // return new Promise<[string | undefined, string | undefined]>(
            //   (_, reject) => reject(new Error("Basic auth failed"))
            // );
            return new Promise<[string | undefined, string | undefined]>(
              () => {}
            );
          };

          const promise = this.authenticate({
            type,
            repo: repoName,
            user: user,
            headers,
          });

          if (promise instanceof Promise) {
            return promise
              .then((ctx) => {
                context = ctx;
                next();
              })
              .catch(next);
          } else {
            context = promise;
          }
        } else {
          return next();
        }
      },
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (req.method !== 'GET') return false;

        const u = url.parse(req.url || '');
        const m = u.pathname?.match(/^\/(.+)\/HEAD$/);
        if (!m) return false;
        if (/\.\./.test(m[1])) return false;

        const repo = m[1];

        const next = () => {
          const file = this.dirMap(path.join(m[1], 'HEAD'));
          const exists = this.exists(file);

          if (exists) {
            fs.createReadStream(file).pipe(res);
          } else {
            res.statusCode = 404;
            res.end('not found');
          }
        };

        const exists = this.exists(repo);
        const anyListeners = self.listeners('head').length > 0;
        const dup = new HttpDuplex(req, res);
        dup.exists = exists;
        dup.repo = repo;
        dup.cwd = this.dirMap(repo);

        dup.accept = dup.emit.bind(dup, 'accept');
        dup.reject = dup.emit.bind(dup, 'reject');

        dup.once('reject', (code: number) => {
          dup.statusCode = code || 500;
          dup.end();
        });

        if (!exists && self.autoCreate) {
          dup.once('accept', (dir: string) => {
            self.create(dir || repo, next);
          });
          self.emit('head', dup);
          if (!anyListeners) dup.accept();
        } else if (!exists) {
          res.statusCode = 404;
          res.setHeader('content-type', 'text/plain');
          res.end('repository not found');
        } else {
          dup.once('accept', next);
          self.emit('head', dup);
          if (!anyListeners) dup.accept();
        }
      },
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (req.method !== 'POST') return false;
        const m = req.url?.match(/\/(.+)\/git-(.+)/);
        if (!m) return false;
        if (/\.\./.test(m[1])) return false;

        const repo = m[1],
          service = m[2];

        if (services.indexOf(service) < 0) {
          res.statusCode = 405;
          res.end('service not available');
          return;
        }

        res.setHeader(
          'content-type',
          'application/x-git-' + service + '-result'
        );
        noCache(res);

        const action = createAction<T>(
          {
            repo: repo,
            service: service as ServiceString,
            cwd: self.dirMap(repo),
          },
          req,
          res,
          context
        );

        action.on('header', () => {
          const evName = action.evName;
          if (evName) {
            const anyListeners = self.listeners(evName).length > 0;
            self.emit(evName, action);
            if (!anyListeners) action.accept();
          }
        });
      },
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        if (req.method !== 'GET' && req.method !== 'POST') {
          res.statusCode = 405;
          res.end('method not supported');
        } else {
          return false;
        }
      },
      (req: http.IncomingMessage, res: http.ServerResponse) => {
        res.statusCode = 404;
        res.end('not found');
      },
    ];
    res.setHeader('connection', 'close');

    (function next(ix) {
      const x = handlers[ix].call(self, req, res);
      if (x === false) next(ix + 1);
    })(0);
  }
  /**
   * starts a git server on the given port
   * @param  port  - the port to start the server on
   * @param  options  - the options to add extended functionality to the server
   * @param  options.type - this is either https or http (the default is http)
   * @param  options.key - the key file for the https server
   * @param  options.cert - the cert file for the https server
   * @param  callback - the function to call when server is started or error has occurred
   */
  listen(
    port: number,
    options?: GitServerOptions,
    callback?: () => void
  ): this {
    if (!options) {
      options = { type: 'http' };
    }

    const createServer =
      options.type == 'http'
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
   * @param will resolve or reject when the server closes or fails to close.
   */
  close(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.server?.close((err) => {
        err ? reject(err) : resolve('Success');
      });
    });
  }
}
