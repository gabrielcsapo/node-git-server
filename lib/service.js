const through = require('through');
const HttpDuplex = require('./http-duplex');
const zlib = require('zlib');

const { spawn } = require('child_process');

const headerRE = {
  'receive-pack': '([0-9a-fA-F]+) ([0-9a-fA-F]+) refs\/(heads|tags)\/(.*?)( |00|\u0000)|^(0000)$', // eslint-disable-line
  'upload-pack': '^\\S+ ([0-9a-fA-F]+)'
};

class Service extends HttpDuplex {
  /**
   * Handles invoking the git-*-pack binaries
   * @class Service
   * @extends HttpDuplex
   * @param  {Object}               opts - options to bootstrap the service object
   * @param  {http.IncomingMessage }   req  - http request object
   * @param  {http.ServerResponse}  res  - http response
   */
  constructor(opts, req, res) {
    super(req, res);

    var data = '';
    var self = this;

    this.status = 'pending';
    this.repo = opts.repo;
    this.service = opts.service;
    this.cwd = opts.cwd;

    var buffered = through().pause();

    // stream needed to receive data after decoding, but before accepting
    var ts = through();

    var decoder = {
        'gzip': () => zlib.createGunzip(),
        'deflate': () => zlib.createDeflate()
    }[req.headers['content-encoding']];

    if (decoder) {
        // data is compressed with gzip or deflate
        req.pipe(decoder()).pipe(ts).pipe(buffered);
    } else {
        // data is not compressed
        req.pipe(ts).pipe(buffered);
    }

    if(req.headers["authorization"]) {
      const tokens = req.headers["authorization"].split(" ");
      if (tokens[0] === "Basic") {
          const splitHash = new Buffer.from(tokens[1], 'base64').toString('utf8').split(":");
          this.username = splitHash.shift();
      }
    }

    ts.once('data', function onData(buf) {
        data += buf;

        var ops = data.match(new RegExp(headerRE[self.service], 'gi'));
        if (!ops) return;
        data = undefined;

        ops.forEach(function(op) {
            var type;
            var m = op.match(new RegExp(headerRE[self.service]));

            if (self.service === 'receive-pack') {
                self.last = m[1];
                self.commit = m[2];

                if (m[3] == 'heads') {
                    type = 'branch';
                    self.evName = 'push';
                } else {
                    type = 'version';
                    self.evName = 'tag';
                }

                var headers = {
                    last: self.last,
                    commit: self.commit
                };
                headers[type] = self[type] = m[4];
                self.emit('header', headers);
            } else if (self.service === 'upload-pack') {
                self.commit = m[1];
                self.evName = 'fetch';
                self.emit('header', {
                    commit: self.commit
                });
            }
        });
    });

    self.once('accept', function onAccept() {
        process.nextTick(function() {
            var cmd = ['git-' + opts.service, '--stateless-rpc', opts.cwd];
            var ps = spawn(cmd[0], cmd.slice(1));
            ps.on('error', function(err) {
              self.emit('error', new Error(`${err.message} running command ${cmd.join(' ')}`));
            });

            self.emit('service', ps);

            var respStream = through(function(c) {
                if (self.listeners('response').length === 0) return this.queue(c);
                // prevent git from sending the close signal
                if (c.length === 4 && c.toString() === '0000') return;
                this.queue(c);
            }, function() {
                if (self.listeners('response').length > 0) return;
                this.queue(null);
            });


            self.emit('response', respStream, function endResponse() {
                res.queue(new Buffer.from('0000'));
                res.queue(null);
            });
            ps.stdout.pipe(respStream).pipe(res);

            buffered.pipe(ps.stdin);
            buffered.resume();

            ps.on('exit', self.emit.bind(self, 'exit'));
        });
    });

    self.once('reject', function onReject(code, msg) {
        res.statusCode = code;
        res.end(msg);
    });
  }
  /**
   * reject request in flight
   * @method reject
   * @memberof Service
   * @param  {Number} code - http response code
   * @param  {String} msg  - message that should be displayed on teh client
   */
  reject(code, msg) {
      if (this.status !== 'pending') return;

      if (msg === undefined && typeof code === 'string') {
          msg = code;
          code = 500;
      }
      this.status = 'rejected';
      this.emit('reject', code || 500, msg);
  }
  /**
   * accepts request to access resource
   * @method accept
   * @memberof Service
   */
  accept() {
      if (this.status !== 'pending') return;

      this.status = 'accepted';
      this.emit('accept');
  }
}

module.exports = Service;
