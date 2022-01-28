import fs from 'fs';
import path from 'path';
import http, { ServerOptions } from 'http';
import https from 'https';

import { spawn } from 'child_process';
import { EventEmitter } from 'events';

import { HttpDuplex } from './http-duplex';
import { parseRequest, HttpError, ParsedGitRequest } from './protocol';
import { ServiceString } from './types';
import {
  parseGitName,
  createAction,
  packSideband,
  basicAuth,
  BasicAuthError,
  noCache,
} from './util';

interface GitServerOptions extends ServerOptions {
  type: 'http' | 'https';
}

export interface GitOptions<T> {
  autoCreate?: boolean;
  authenticate?: (options: GitAuthenticateOptions) => Promise<T> | T;
  checkout?: boolean;
}

export interface GitAuthenticateOptions {
  type: 'fetch' | 'push' | 'info';
  repo: string;
  getUser: () => Promise<[string | undefined, string | undefined]>;
  headers: http.IncomingHttpHeaders;
}

/**
 * An http duplex object (see below) with these extra properties:
 */
export interface TagData<T> extends HttpDuplex<T> {
  repo: string; // The string that defines the repo
  commit: string; // The string that defines the commit sha
  version: string; // The string that defines the tag being pushed
}

/**
 * Is a http duplex object (see below) with these extra properties
 */
export interface PushData<T> extends HttpDuplex<T> {
  repo: string; // The string that defines the repo
  commit: string; // The string that defines the commit sha
  branch: string; // The string that defines the branch
}

/**
 * an http duplex object (see below) with these extra properties
 */
export interface FetchData<T> extends HttpDuplex<T> {
  repo: string; // The string that defines the repo
  commit: string; //  The string that defines the commit sha
}

/**
 * an http duplex object (see below) with these extra properties
 */
export interface InfoData<T> extends HttpDuplex<T> {
  repo: string; // The string that defines the repo
}

/**
 * an http duplex object (see below) with these extra properties
 */
export interface HeadData<T> extends HttpDuplex<T> {
  repo: string; // The string that defines the repo
}

export interface GitEvents<T> {
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
export class Git<T = any> extends EventEmitter implements GitEvents<T> {
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
   * @param  options.authenticate - an optionally async function that has the following arguments ({ type, repo, getUser, headers }) and will be called when a request comes through, if set.
   *
     authenticate: async ({ type, repo, getUser, headers }) => {
       const [username, password] = await getUser();
       // Check user credentials
       if (password !== 's3cure!') throw new Error("Wrong password!");
       // Return a context value which can be used to authorize requests in the more specific event handlers (such as 'push')
       // The value you return here will eb accessible
       if (username === 'admin') {
         return { protectedBranches: [] };
       } else {
         return { protectedBranches: ["main", "hotfix/*"] };
       }
     }
   * @param  options.checkout - If `opts.checkout` is true, create and expect checked-out repos instead of bare repos
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
   * returns the type of service being processed.
   * @param  service - the service type
   */
  getType(service: string | null): 'fetch' | 'push' | 'info' {
    switch (service) {
      case 'upload-pack':
        return 'fetch';
      case 'receive-pack':
        return 'push';
      default:
        return 'info';
    }
  }

  private _infoServiceResponse(
    service: ServiceString,
    repoLocation: string,
    res: http.ServerResponse
  ) {
    res.write(packSideband('# service=git-' + service + '\n'));
    res.write('0000');

    const isWin = /^win/.test(process.platform);

    const cmd = isWin
      ? ['git', service, '--stateless-rpc', '--advertise-refs', repoLocation]
      : ['git-' + service, '--stateless-rpc', '--advertise-refs', repoLocation];

    const ps = spawn(cmd[0], cmd.slice(1));

    ps.on('error', (err) => {
      this.emit(
        'error',
        new Error(`${err.message} running command ${cmd.join(' ')}`)
      );
    });
    ps.stdout.pipe(res);
  }

  private _infoResponse(
    repo: string,
    service: ServiceString,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: T | undefined
  ) {
    const next = () => {
      res.setHeader(
        'content-type',
        'application/x-git-' + service + '-advertisement'
      );
      noCache(res);
      this._infoServiceResponse(service, this.dirMap(repo), res);
    };

    const dup = new HttpDuplex(req, res, context);
    dup.cwd = this.dirMap(repo);
    dup.repo = repo;

    dup.accept = dup.emit.bind(dup, 'accept');
    dup.reject = dup.emit.bind(dup, 'reject');

    dup.once('reject', (code: number) => {
      res.statusCode = code || 500;
      res.end();
    });

    const anyListeners = this.listeners('info').length > 0;

    const exists = this.exists(repo);
    dup.exists = exists;

    if (!exists && this.autoCreate) {
      dup.once('accept', () => {
        this.create(repo, next);
      });

      this.emit('info', dup);
      if (!anyListeners) dup.accept();
    } else if (!exists) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain');
      res.end('repository not found');
    } else {
      dup.once('accept', next);
      this.emit('info', dup);

      if (!anyListeners) dup.accept();
    }
  }

  private _headResponse(
    repo: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: T | undefined
  ) {
    const next = () => {
      const file = this.dirMap(path.join(repo, 'HEAD'));
      const exists = this.exists(file);

      if (exists) {
        fs.createReadStream(file).pipe(res);
      } else {
        res.statusCode = 404;
        res.end('not found');
      }
    };

    const exists = this.exists(repo);
    const anyListeners = this.listeners('head').length > 0;
    const dup = new HttpDuplex(req, res, context);
    dup.exists = exists;
    dup.repo = repo;
    dup.cwd = this.dirMap(repo);

    dup.accept = dup.emit.bind(dup, 'accept');
    dup.reject = dup.emit.bind(dup, 'reject');

    dup.once('reject', (code: number) => {
      dup.statusCode = code || 500;
      dup.end();
    });

    if (!exists && this.autoCreate) {
      dup.once('accept', (dir: string) => {
        this.create(dir || repo, next);
      });
      this.emit('head', dup);
      if (!anyListeners) dup.accept();
    } else if (!exists) {
      res.statusCode = 404;
      res.setHeader('content-type', 'text/plain');
      res.end('repository not found');
    } else {
      dup.once('accept', next);
      this.emit('head', dup);
      if (!anyListeners) dup.accept();
    }
  }

  private _serviceResponse(
    repo: string,
    service: ServiceString,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: T | undefined
  ) {
    res.setHeader('content-type', 'application/x-git-' + service + '-result');
    noCache(res);

    const action = createAction<T>(
      {
        repo: repo,
        service: service,
        cwd: this.dirMap(repo),
      },
      req,
      res,
      context
    );

    action.on('header', () => {
      const evName = action.evName;
      if (evName) {
        const anyListeners = this.listeners(evName).length > 0;
        this.emit(evName, action);
        if (!anyListeners) action.accept();
      }
    });
  }

  private async _authenticateAndRespond(
    info: ParsedGitRequest,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    const repoName = parseGitName(info.repo);

    let context: T | undefined = undefined;

    let next: () => void;
    if (info.route === 'info') {
      next = () => {
        this._infoResponse(info.repo, info.service, req, res, context);
      };
    } else if (info.route === 'head') {
      next = () => {
        this._headResponse(info.repo, req, res, context);
      };
    } else {
      next = () => {
        this._serviceResponse(info.repo, info.service, req, res, context);
      };
    }

    const afterAuthenticate = (error?: Error | string | void) => {
      if (error instanceof BasicAuthError) {
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('WWW-Authenticate', 'Basic realm="authorization needed"');
        res.writeHead(401);
        res.end('401 Unauthorized');
      } else if (error) {
        res.setHeader('Content-Type', 'text/plain');
        res.writeHead(403);
        res.end(typeof error === 'string' ? error : error.toString());
      } else {
        next();
      }
    };

    // check if the repo is authenticated
    if (this.authenticate) {
      const type = this.getType(info.service);
      const headers = req.headers;
      const getUser = async () => {
        return basicAuth(req);
      };

      try {
        context = await this.authenticate({
          type,
          repo: repoName,
          getUser,
          headers,
        });
        afterAuthenticate();
      } catch (e: any) {
        afterAuthenticate(e);
      }
    } else {
      next();
    }
  }

  /**
   * Handle incoming HTTP requests with a connect-style middleware
   * @param  http request object
   * @param  http response object
   */
  handle(req: http.IncomingMessage, res: http.ServerResponse) {
    res.setHeader('connection', 'close');

    const handleError = (e: any) => {
      if (e instanceof HttpError) {
        res.statusCode = e.statusCode;
        res.end(e.statusText);
      } else {
        res.statusCode = 500;
        console.error(e);
        res.end('internal server error');
      }
    };

    try {
      const info = parseRequest(req);
      this._authenticateAndRespond(info, req, res).catch(handleError);
    } catch (e) {
      handleError(e);
    }
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
