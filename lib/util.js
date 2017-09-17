/**
 * @module lib/util
 */

const httpDuplex = require('http-duplex');
const { spawn } = require('child_process');

const Service = require('./service');

const Util = {
  /**
   * adds headers to the response object to add cache control
   * @method noCache
   * @param  {Object} res - http response object
   */
  noCache: function noCache(res) {
      res.setHeader('expires', 'Fri, 01 Jan 1980 00:00:00 GMT');
      res.setHeader('pragma', 'no-cache');
      res.setHeader('cache-control', 'no-cache, max-age=0, must-revalidate');
  },
  /**
   * sets and parses basic auth headers if they exist
   * @method basicAuth
   * @param  {Object}   req      - http request object
   * @param  {Object}   res      - http response object
   * @param  {Function} callback - function(username, password, error)
   */
  basicAuth: function basicAuth(req, res, callback) {
      if(!req.headers["authorization"]) {
          res.setHeader("Content-Type", 'text/plain');
          res.setHeader("WWW-Authenticate", 'Basic realm="authorization needed"');
          res.writeHead(401);
          res.end('401 Unauthorized');
      } else {
          const tokens = req.headers["authorization"].split(" ");
          if (tokens[0] === "Basic") {
              const splitHash = new Buffer(tokens[1], 'base64').toString('utf8').split(":");
              const username = splitHash.shift();
              const password = splitHash.join(":");
              callback(username, password, null);
          }
      }
  },
  /**
   * returns when process has fully exited
   * @method onExit
   * @param  {EventEmitter}   ps - event emitter to listen to
   * @param  {Function} callback - function(code, signature)
   */
  onExit: function onExit(ps, callback) {
      var code, sig;
      var pending = 3;

      const onend = () => {
          if (--pending === 0) {
              callback(code, sig);
          }
      };

      ps.on('exit', (c, s) => {
          code = c;
          sig = s;
      });

      ps.on('exit', onend);
      ps.stdout.on('end', onend);
      ps.stderr.on('end', onend);
  },
  serviceRespond: function serviceRespond(self, service, file, res) {
      const pack = (s) => {
          var n = (4 + s.length).toString(16);
          return Array(4 - n.length + 1).join('0') + n + s;
      };

      res.write(pack('# service=git-' + service + '\n'));
      res.write('0000');

      const cmd = ['git-' + service, '--stateless-rpc', '--advertise-refs', file];
      const ps = spawn(cmd[0], cmd.slice(1));
      ps.on('error', (err) => {
          self.emit('error', new Error(
              err.message + ' running command ' + cmd.join(' ')
          ));
      });
      ps.stdout.pipe(res);
  },
  infoResponse: function infoResponse(opts, req, res) {
    var self = opts.repos;
    var dup = httpDuplex(req, res);
    dup.cwd = self.dirMap(opts.repo);
    dup.repo = opts.repo;

    dup.accept = dup.emit.bind(dup, 'accept');
    dup.reject = dup.emit.bind(dup, 'reject');

    dup.once('reject', (code) => {
        res.statusCode = code || 500;
        res.end();
    });

    var anyListeners = self.listeners('info').length > 0;

    self.exists(opts.repo, (ex) => {
        dup.exists = ex;

        if (!ex && self.autoCreate) {
            dup.once('accept', () => {
                self.create(opts.repo, next);
            });

            self.emit('info', dup);
            if (!anyListeners) dup.accept();
        } else if (!ex) {
            res.statusCode = 404;
            res.setHeader('content-type', 'text/plain');
            res.end('repository not found');
        } else {
            dup.once('accept', next);
            self.emit('info', dup);

            if (!anyListeners) dup.accept();
        }
    });

    function next() {
        res.setHeader(
            'content-type',
            'application/x-git-' + opts.service + '-advertisement'
        );
        Util.noCache(res);
        var d = self.dirMap(opts.repo);
        Util.serviceRespond(self, opts.service, d, res);
    }
  },
  /**
   * parses a git string and returns the repo name
   * @method parseGitName
   * @param  {String}     repo - the raw repo name containing .git
   * @return {String}          - returns the name of the repo
   */
  parseGitName: function parseGitName(repo) {
    const locationOfGit = repo.lastIndexOf('.git');
    return repo.substr(0, locationOfGit > 0 ? locationOfGit : repo.length);
  },
  /**
   * responds with the correct service depending on the action
   * @method createAction
   * @param  {Object}     opts - options to pass Service
   * @param  {Object}     req  - http request object
   * @param  {Object}     res  - http response object
   * @return {Service}
   */
  createAction: function createAction(opts, req, res) {
    let service = new Service(opts, req, res);

    Object.keys(opts).forEach((key) => {
        service[key] = opts[key];
    });

    return service;
  }
};

module.exports = Util;
