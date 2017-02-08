var fs = require('fs');
var path = require('path');
var http = require('http');
var inherits = require('util').inherits
var handle = require('./lib/handle');

var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;

var onexit = require('./lib/onexit');

module.exports = function (repoDir, opts) {
    if (!opts) opts = {};
    var dirMap = typeof repoDir === 'function'
        ? repoDir
        : function (dir) {
          if(dir) {
            return path.join(repoDir, dir);
          } else {
            return repoDir;
          }
        }
    ;
    return new Git(dirMap, opts);
};

function Git (dirMap, opts) {
    EventEmitter.call(this);

    this.dirMap = dirMap;
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
    this.dirMap(dir).split('/').forEach(function(dir, index, splits) {
      var curParent = splits.slice(0, index).join('/');
      var dirPath = path.resolve(curParent, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
      }
    });
    cb();
};

Git.prototype.create = function (repo, cb) {
    var self = this;
    if (typeof cb !== 'function') cb = function () {};
    var cwd = process.cwd();

    if (!/\.git$/.test(repo)) repo += '.git';

    self.exists(repo, function (ex) {
        if (!ex) self.mkdir(repo, next)
        else next()
    });

    function next (err) {
        if (err) return cb(err);

        var dir = self.dirMap(repo);
        if (self.checkout) {
            var ps = spawn('git', [ 'init', dir ]);
        }
        else {
            var ps = spawn('git', [ 'init', '--bare', dir ]);
        }

        var err = '';
        ps.stderr.on('data', function (buf) { err += buf });

        onexit(ps, function (code) {
            if (!cb) {}
            else if (code) cb(err || true)
            else cb(null)
        });
    }
};

Git.prototype.handle = handle;
Git.prototype.listen = function(port, callback) {
    var self = this;
    this.server = http.createServer(function (req, res) {
        self.handle(req, res);
    });
    this.server.listen(port, callback);
}
Git.prototype.close = function() {
    this.server.close();
}
