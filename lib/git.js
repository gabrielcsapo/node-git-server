const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const qs = require('querystring');
const httpDuplex = require('http-duplex');

const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const { parseGitName, createAction, infoResponse, onExit, basicAuth, noCache } = require('./util');

const services = ['upload-pack', 'receive-pack'];

/**
 * @class Git
 */
class Git extends EventEmitter {
  /**
   * returns an instance of Git
   * @param  {(String|Function)}    repoDir   - Create a new repository collection from the directory `repoDir`. `repoDir` should be entirely empty except for git repo directories. If `repoDir` is a function, `repoDir(repo)` will be used to dynamically resolve project directories. The return value of `repoDir(repo)` should be a string path specifying where to put the string `repo`. Make sure to return the same value for `repo` every time since `repoDir(repo)` will be called multiple times.
   * @param  {Object}    options - options that can be applied on the new instance being created
   * @param  {Boolean=}   options.autoCreate - By default, repository targets will be created if they don't exist. You can
   disable that behavior with `options.autoCreate = true`
   * @param  {Function}  options.authenticate - a function that has the following arguments (repo, username, password, next) and will be called when a request comes through if set
   *
     authenticate: (repo, username, password, next) => {
       console.log(repo, username, password); // eslint-disable-line
       next();
     }
   * @param  {Boolean=}  options.checkout - If `opts.checkout` is true, create and expected checked-out repos instead of
   bare repos
   * @return {Git}
   * @description
   # events

   ## repos.on('push', function (push) { ... }

   Emitted when somebody does a `git push` to the repo.

   Exactly one listener must call `push.accept()` or `push.reject()`. If there are
   no listeners, `push.accept()` is called automatically.

   `push` is an http duplex object (see below) with these extra properties:

   * push.repo
   * push.commit
   * push.branch

   ## repos.on('tag', function (tag) { ... }

   Emitted when somebody does a `git push --tags` to the repo.

   Exactly one listener must call `tag.accept()` or `tag.reject()`. If there are
   no listeners, `tag.accept()` is called automatically.

   `tag` is an http duplex object (see below) with these extra properties:

   * tag.repo
   * tag.commit
   * tag.version

   ## repos.on('fetch', function (fetch) { ... }

   Emitted when somebody does a `git fetch` to the repo (which happens whenever you
   do a `git pull` or a `git clone`).

   Exactly one listener must call `fetch.accept()` or `fetch.reject()`. If there are
   no listeners, `fetch.accept()` is called automatically.

   `fetch` is an http duplex objects (see below) with these extra properties:

   * fetch.repo
   * fetch.commit

   ## repos.on('info', function (info) { ... }

   Emitted when the repo is queried for info before doing other commands.

   Exactly one listener must call `info.accept()` or `info.reject()`. If there are
   no listeners, `info.accept()` is called automatically.

   `info` is an http duplex object (see below) with these extra properties:

   * info.repo

   ## repos.on('head', function (head) { ... }

   Emitted when the repo is queried for HEAD before doing other commands.

   Exactly one listener must call `head.accept()` or `head.reject()`. If there are
   no listeners, `head.accept()` is called automatically.

   `head` is an http duplex object (see below) with these extra properties:

   * head.repo

   ## push.on('response', function(response, done) { ... })

   Emitted when node-git-server creates a response stream that will be sent to the git client on the other end.

   This should really only be used if you want to send verbose or error messages to the remote git client.

   `response` is a writable stream that can accept buffers containing git packfile sidechannel transfer protocol encoded strings. `done` is a callback that must be called when you want to end the response.

   If you create a response listener then you must either call the `done` function or execute the following end sequence when you want to end the response:

   ```js
   response.queue(new Buffer('0000'))
   response.queue(null)
   ```

   If you never use the response event then the above data will be sent by default. Binding a listener to the response event will prevent the end sequence those from being sent, so you must send them yourself after sending any other messages.

   # http duplex objects

   The arguments to each of the events `'push'`, `'fetch'`, `'info'`, and `'head'` are [http duplex](http://github.com/gabrielcsapo/http-duplex) that act as both http
   server request and http server response objects so you can pipe to and from them.

   For every event if there are no listeners `dup.accept()` will be called
   automatically.

   ## dup.accept()

   Accept the pending request.

   ## dup.reject()

   Reject the pending request.
   */
  constructor(repoDir, options={}) {
    super();

    if(typeof repoDir === 'function') {
        this.dirMap = repoDir;
    } else {
        this.dirMap = (dir) => {
          if(dir) {
            return path.resolve(repoDir, dir);
          } else {
            return repoDir;
          }
        };
    }

    this.authenticate = options.authenticate;
    this.autoCreate = options.autoCreate === false ? false : true;
    this.checkout = options.checkout;
  }
  /**
   * Get a list of all the repositories
   * @method list
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
   * @param  {String}   repo - name of the repo
   * @param  {Function=} callback - function to be called when finished
   */
  exists(repo, callback) {
      fs.exists(this.dirMap(repo), callback);
  }
  /**
   * Create a subdirectory `dir` in the repo dir with a callback `cb(err)`.
   * @method mkdir
   * @param  {String}   dir - directory name
   * @param  {Function=} callback  - callback to be called when finished
   */
  mkdir(dir, callback) {
      // TODO: remove sync operations
      const parts = this.dirMap(dir).split('/');
      for(var i = 0; i <= parts.length; i++) {
          const directory = parts.slice(0, i).join('/');
          if(directory && !fs.existsSync(directory)) {
              fs.mkdirSync(directory);
          }
      }
      callback();
  }
  /**
   * Create a new bare repository `repoName` in the instance repository directory.
   * @method create
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
   * Handle incoming HTTP requests with a connect-style middleware
   * @method handle
   * @param  {Object} req - http request object
   * @param  {Object} res - http response object
   */
  handle(req, res) {
      const handlers = [
        function(req, res, done) {
            var u = url.parse(req.url);
            var m = u.pathname.match(/\/(.+)\/info\/refs$/) || u.pathname.match(/\/(.+)\/git-receive-pack$/) || u.pathname.match(/\/(.+)\/git-upload-pack$/);
            if(!m) return false; // this action is not supported
            var repo = parseGitName(m[1]);

            // check if the repo is authenticated
            if(this.authenticate) {
                basicAuth(req, res, (username, password) => {
                    this.authenticate(repo, username, password, (error) => {
                      if(error) {
                        res.setHeader("Content-Type", 'text/plain');
                        res.setHeader("WWW-Authenticate", 'Basic realm="authorization needed"');
                        res.writeHead(401);
                        res.end(error);
                        return;
                      } else {
                        done();
                      }
                    });
                });
            } else {
                return done();
            }
        },
        function(req, res) {
            if (req.method !== 'GET') return false;

            var u = url.parse(req.url);
            var m = u.pathname.match(/\/(.+)\/info\/refs$/);
            if (!m) return false;
            if (/\.\./.test(m[1])) return false;

            var self = this;
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

            infoResponse({
                repos: self,
                repo: repo,
                service: service,
            }, req, res);
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
                const dup = httpDuplex(req, res);
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
  listen(port, callback) {
      var self = this;
      this.server = http.createServer(function(req, res) {
          self.handle(req, res);
      });
      this.server.listen(port, callback);
  }
  close() {
      this.server.close();
  }
}

module.exports = Git;
