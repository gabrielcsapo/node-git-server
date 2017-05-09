var fs = require('fs');
var path = require('path');
var http = require('http');
var inherits = require('util').inherits;
var handle = require('./lib/handle');

var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;

var onexit = require('./lib/onexit');

module.exports = function (repoDir, opts) {
    if (!opts) opts = {};
    var dirMap;
    if(typeof repoDir === 'function') {
        dirMap = repoDir;
    } else {
        dirMap = (dir) => {
          if(dir) {
            return path.resolve(repoDir, dir);
          } else {
            return repoDir;
          }
        };
    }
    return new Git(dirMap, opts);
};

function Git (dirMap, opts) {
    EventEmitter.call(this);

    this.dirMap = dirMap;
    this.repos = opts.repos || {};
    this.autoCreate = opts.autoCreate === false ? false : true;
    this.checkout = opts.checkout;
}

inherits(Git, EventEmitter);

Git.prototype.list = function (cb) {
    fs.readdir(this.dirMap(), cb);
};

Git.prototype.exists = function (repo, cb) {
    (fs.exists || path.exists)(this.dirMap(repo), cb);
};

Git.prototype.mkdir = function (dir, cb) {
    const parts = this.dirMap(dir).split('/');
    for(var i = 0; i <= parts.length; i++) {
        const directory = parts.slice(0, i).join('/');
        if(directory && !fs.existsSync(directory)) {
            fs.mkdirSync(directory);
        }
    }
    cb();
};

Git.prototype.create = function (repo, cb) {
    var self = this;
    if (typeof cb !== 'function') cb = function () {};

    if (!/\.git$/.test(repo)) repo += '.git';

    self.exists(repo, function (ex) {
        if (!ex) {
            self.mkdir(repo, next);
        } else {
            next();
        }
    });

    function next (err) {
        if (err) return cb(err);

        var ps, error = '';

        var dir = self.dirMap(repo);
        if (self.checkout) {
            ps = spawn('git', [ 'init', dir ]);
        }
        else {
            ps = spawn('git', [ 'init', '--bare', dir ]);
        }

        ps.stderr.on('data', function (buf) { error += buf; });
        onexit(ps, function (code) {
            if (!cb) { return; }
            else if (code) cb(error || true);
            else cb(null);
        });
    }
};

Git.prototype.handle = handle;
Git.prototype.listen = function(port, callback) {
    var self = this;
    this.server = http.createServer(function(req, res) {
        self.handle(req, res);
    });
    this.server.listen(port, callback);
};
Git.prototype.close = function() {
    this.server.close();
};
