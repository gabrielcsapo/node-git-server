/**
 * @module lib/util
 */

const { spawn } = require('child_process');

const httpDuplex = require('./http-duplex');
const Service = require('./service');

const Util = {
  /**
   * adds headers to the response object to add cache control
   * @method noCache
   * @param  {http.ServerResponse}  res  - http response
   */
  noCache: function noCache(res) {
      res.setHeader('expires', 'Fri, 01 Jan 1980 00:00:00 GMT');
      res.setHeader('pragma', 'no-cache');
      res.setHeader('cache-control', 'no-cache, max-age=0, must-revalidate');
  },
  /**
   * sets and parses basic auth headers if they exist
   * @method basicAuth
   * @param  {http.ServerRequest}   req  - http request object
   * @param  {http.ServerResponse}  res  - http response
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
      let code;
      let sig;
      let pending = 3;

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
  /**
   * execute given git operation and respond
   * @method serviceRespond
   * @param  {HttpDuplex}   dup          - duplex object to catch errors
   * @param  {String}       service      - the method that is responding infoResponse (push, pull, clone)
   * @param  {String}       repoLocation - the repo path on disk
   * @param  {http.ServerResponse}  res  - http response
   */
  serviceRespond: function serviceRespond(dup, service, repoLocation, res) {
      const pack = (s) => {
          var n = (4 + s.length).toString(16);
          return Array(4 - n.length + 1).join('0') + n + s;
      };

      res.write(pack('# service=git-' + service + '\n'));
      res.write('0000');

      const cmd = ['git-' + service, '--stateless-rpc', '--advertise-refs', repoLocation];
      const ps = spawn(cmd[0], cmd.slice(1));
      ps.on('error', (err) => {
          dup.emit('error', new Error(`${err.message} running command ${cmd.join(' ')}`));
      });
      ps.stdout.pipe(res);
  },
  /**
   * sends http response using the appropriate output from service call
   * @method infoResponse
   * @param  {Git}        git     - an instance of git object
   * @param  {String}     repo    - the repository
   * @param  {String}     service - the method that is responding infoResponse (push, pull, clone)
   * @param  {http.ServerRequest}   req  - http request object
   * @param  {http.ServerResponse}  res  - http response
   */
  infoResponse: function infoResponse(git, repo, service, req, res) {
    var dup = new httpDuplex(req, res);
    dup.cwd = git.dirMap(repo);
    dup.repo = repo;

    dup.accept = dup.emit.bind(dup, 'accept');
    dup.reject = dup.emit.bind(dup, 'reject');

    dup.once('reject', (code) => {
        res.statusCode = code || 500;
        res.end();
    });

    var anyListeners = git.listeners('info').length > 0;

    git.exists(repo, (ex) => {
        dup.exists = ex;

        if (!ex && git.autoCreate) {
            dup.once('accept', () => {
                git.create(repo, next);
            });

            git.emit('info', dup);
            if (!anyListeners) dup.accept();
        } else if (!ex) {
            res.statusCode = 404;
            res.setHeader('content-type', 'text/plain');
            res.end('repository not found');
        } else {
            dup.once('accept', next);
            git.emit('info', dup);

            if (!anyListeners) dup.accept();
        }
    });

    function next() {
        res.setHeader(
            'content-type',
            'application/x-git-' + service + '-advertisement'
        );
        Util.noCache(res);
        Util.serviceRespond(
          git,
          service,
          git.dirMap(repo),
          res
        );
    }
  },
  /**
   * parses a git string and returns the repo name
   * @method parseGitName
   * @param  {String}     repo - the raw repo name containing .git
   * @return {String}     returns the name of the repo
   */
  parseGitName: function parseGitName(repo) {
    const locationOfGit = repo.lastIndexOf('.git');
    return repo.substr(0, locationOfGit > 0 ? locationOfGit : repo.length);
  },
  /**
   * responds with the correct service depending on the action
   * @method createAction
   * @param  {Object}     opts - options to pass Service
   * @param  {http.ServerRequest}   req  - http request object
   * @param  {http.ServerResponse}  res  - http response
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
