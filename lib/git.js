const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const url = require('url');
const qs = require('querystring');
const httpDuplex = require('./http-duplex');

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const { parseGitName, createAction, infoResponse, onExit, basicAuth, noCache } = require('./util');

const services = ['upload-pack', 'receive-pack'];

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
  * @property {String} tag.version - the string that defines the repo
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

class Git extends EventEmitter {
  /**
   *
   * Handles invoking the git-*-pack binaries
   * @class Git
   * @extends EventEmitter
   * @param  {(String|Function)}    repoDir   - Create a new repository collection from the directory `repoDir`. `repoDir` should be entirely empty except for git repo directories. If `repoDir` is a function, `repoDir(repo)` will be used to dynamically resolve project directories. The return value of `repoDir(repo)` should be a string path specifying where to put the string `repo`. Make sure to return the same value for `repo` every time since `repoDir(repo)` will be called multiple times.
   * @param  {Object}    options - options that can be applied on the new instance being created
   * @param  {Boolean=}  options.autoCreate - By default, repository targets will be created if they don't exist. You can
   disable that behavior with `options.autoCreate = true`
   * @param  {Function}  options.authenticate - a function that has the following arguments ({ type, repo, username, password, headers }, next) and will be called when a request comes through if set
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
   * @param  {Boolean=}  options.checkout - If `opts.checkout` is true, create and expected checked-out repos instead of bare repos
  */
  constructor(repoDir, options={}) {
    super();

    if(typeof repoDir === 'function') {
        this.dirMap = repoDir;
    } else {
        this.dirMap = (dir) => {
            return (path.normalize(dir ? path.join(repoDir, dir) : repoDir));
        };
    }

    this.authenticate = options.authenticate;
    this.autoCreate = options.autoCreate === false ? false : true;
    this.checkout = options.checkout;
  }
  /**
   * Get a list of all the repositories
   * @method list
   * @memberof Git
   * @param  {Function} callback function to be called when repositories have been found `function(error, repos)`
   */
  list(callback) {
      fs.readdir(this.dirMap(), (error, results) => {
        if(error) return callback(error);
        let repos = results.filter((r) => {
          return r.substring(r.length - 3, r.length) == 'git';
        }, []);

        callback(null, repos);
      });
  }
  /**
   * Find out whether `repoName` exists in the callback `cb(exists)`.
   * @method exists
   * @memberof Git
   * @param  {String}   repo - name of the repo
   * @param  {Function=} callback - function to be called when finished
   */
  exists(repo, callback) {
      fs.exists(this.dirMap(repo), callback);
  }
  /**
   * Create a subdirectory `dir` in the repo dir with a callback `cb(err)`.
   * @method mkdir
   * @memberof Git
   * @param  {String}   dir - directory name
   * @param  {Function=} callback  - callback to be called when finished
   */
  mkdir(dir, callback) {
      // TODO: remove sync operations
      const parts = this.dirMap(dir).split(path.sep);
      for(var i = 0; i <= parts.length; i++) {
          const directory = parts.slice(0, i).join(path.sep);
          if(directory && !fs.existsSync(directory)) {
              fs.mkdirSync(directory);
          }
      }
      callback();
  }
  /**
   * Create a new bare repository `repoName` in the instance repository directory.
   * @method create
   * @memberof Git
   * @param  {String}   repo - the name of the repo
   * @param  {Function=} callback - Optionally get a callback `cb(err)` to be notified when the repository was created.
   */
  create(repo, callback) {
      var self = this;
      if (typeof callback !== 'function') callback = function () {};

      if (!/\.git$/.test(repo)) repo += '.git';

      self.exists(repo, function (ex) {
          if (!ex) {
              self.mkdir(repo, next);
          } else {
              next();
          }
      });

      function next (err) {
          if (err) return callback(err);

          var ps, error = '';

          var dir = self.dirMap(repo);
          if (self.checkout) {
              ps = spawn('git', [ 'init', dir ]);
          }
          else {
              ps = spawn('git', [ 'init', '--bare', dir ]);
          }

          ps.stderr.on('data', function (buf) { error += buf; });
          onExit(ps, function (code) {
              if (!callback) { return; }
              else if (code) callback(error || true);
              else callback(null);
          });
      }
  }
  /**
   * returns the typeof service being process
   * @method getType
   * @param  {String} service - the service type
   * @return {String}  - will respond with either upload or download
   */
  getType(service) {
    switch(service) {
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
   * @method handle
   * @memberof Git
   * @param  {Object} req - http request object
   * @param  {Object} res - http response object
   */
  handle(req, res) {
      const handlers = [
        function(req, res) {
            if (req.method !== 'GET') return false;

            var self = this;
            var u = url.parse(req.url);
            var m = u.pathname.match(/\/(.+)\/info\/refs$/);
            if (!m) return false;
            if (/\.\./.test(m[1])) return false;

            var repo = m[1];
            var params = qs.parse(u.query);
            if (!params.service) {
                res.statusCode = 400;
                res.end('service parameter required');
                return;
            }

            var service = params.service.replace(/^git-/, '');
            if (services.indexOf(service) < 0) {
                res.statusCode = 405;
                res.end('service not available');
                return;
            }

            var repoName = parseGitName(m[1]);
            var next = (error) => {
              if(error) {
                res.setHeader("Content-Type", 'text/plain');
                res.setHeader("WWW-Authenticate", 'Basic realm="authorization needed"');
                res.writeHead(401);
                res.end(typeof error === 'string' ? error : error.toString());
                return;
              } else {
                return infoResponse(self, repo, service, req, res);
              }
            };

            // check if the repo is authenticated
            if(this.authenticate) {
                const type = this.getType(service);
                const headers = req.headers;
                const user = basicAuth.bind(null, req, res);
                const promise = this.authenticate({ type, repo: repoName, user, headers }, (error) => {
                  return next(error);
                });

                if(promise instanceof Promise) {
                  return promise
                    .then(next)
                    .catch(next);
                }
            } else {
              return next();
            }
        },
        function(req, res) {
            if (req.method !== 'GET') return false;

            var u = url.parse(req.url);
            var m = u.pathname.match(/^\/(.+)\/HEAD$/);
            if (!m) return false;
            if (/\.\./.test(m[1])) return false;

            var self = this;
            var repo = m[1];

            var next = () => {
                const file = self.dirMap(path.join(m[1], 'HEAD'));
                self.exists(file, (ex) => {
                    if (ex) fs.createReadStream(file).pipe(res);
                    else {
                        res.statusCode = 404;
                        res.end('not found');
                    }
                });
            };

            self.exists(repo, (ex) => {
                const anyListeners = self.listeners('head').length > 0;
                const dup = new httpDuplex(req, res);
                dup.exists = ex;
                dup.repo = repo;
                dup.cwd = self.dirMap(repo);

                dup.accept = dup.emit.bind(dup, 'accept');
                dup.reject = dup.emit.bind(dup, 'reject');

                dup.once('reject', (code) => {
                    dup.statusCode = code || 500;
                    dup.end();
                });

                if (!ex && self.autoCreate) {
                    dup.once('accept', (dir) => {
                        self.create(dir || repo, next);
                    });
                    self.emit('head', dup);
                    if (!anyListeners) dup.accept();
                } else if (!ex) {
                    res.statusCode = 404;
                    res.setHeader('content-type', 'text/plain');
                    res.end('repository not found');
                } else {
                    dup.once('accept', next);
                    self.emit('head', dup);
                    if (!anyListeners) dup.accept();
                }
            });
        },
        function(req, res) {
            if (req.method !== 'POST') return false;
            var m = req.url.match(/\/(.+)\/git-(.+)/);
            if (!m) return false;
            if (/\.\./.test(m[1])) return false;

            var self = this;
            var repo = m[1],
                service = m[2];

            if (services.indexOf(service) < 0) {
                res.statusCode = 405;
                res.end('service not available');
                return;
            }

            res.setHeader('content-type', 'application/x-git-' + service + '-result');
            noCache(res);

            var action = createAction({
                repo: repo,
                service: service,
                cwd: self.dirMap(repo)
            }, req, res);

            action.on('header', () => {
                var evName = action.evName;
                var anyListeners = self.listeners(evName).length > 0;
                self.emit(evName, action);
                if (!anyListeners) action.accept();
            });
        },
        (req, res) => {
            if (req.method !== 'GET' && req.method !== 'POST') {
                res.statusCode = 405;
                res.end('method not supported');
            } else {
                return false;
            }
        },
        (req, res) => {
            res.statusCode = 404;
            res.end('not found');
        }
      ];
      res.setHeader('connection', 'close');
      var self = this;
      (function next(ix) {
          var done = () => {
              next(ix + 1);
          };
          var x = handlers[ix].call(self, req, res, done);
          if (x === false) next(ix + 1);
      })(0);
  }
  /**
   * starts a git server on the given port
   * @method listen
   * @memberof Git
   * @param  {Number}   port     - the port to start the server on
   * @param  {Object=}   options  - the options to add extended functionality to the server
   * @param  {String=}   options.type - this is either https or http (the default is http)
   * @param  {Buffer|String=}   options.key - the key file for the https server
   * @param  {Buffer|String=}   options.cert - the cert file for the https server
   * @param  {Function} callback - the function to call when server is started or error has occured
   * @return {Git}  - the Git instance, useful for chaining
   */
  listen(port, options, callback) {
      const self = this;
      if(typeof options == 'function' || !options) {
        callback = options;
        options = { type: 'http' };
      }
      var enableCors = false;
      if (typeof options.enableCors !== 'undefined') {
        if (typeof options.enableCors === 'boolean') {
          enableCors = options.enableCors;
        }
        delete options.enableCors
      }

      const createServer = options.type == 'http' ? http.createServer : https.createServer.bind(this, options);

      this.server = createServer(function(req, res) {
        if (enableCors) {
          // Props: https://gist.github.com/balupton/3696140
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Request-Method', '*');
          res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
          res.setHeader('Access-Control-Allow-Headers', '*');
          if ( req.method === 'OPTIONS' ) {
            res.writeHead(200);
            res.end();
            return;
          }
        }

          self.handle(req, res);
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
          this.server.close((err) => {
              err ? reject(err) : resolve();
          });
      });
  }
}

module.exports = Git;
