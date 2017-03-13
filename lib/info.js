const httpDuplex = require('http-duplex');
const spawn = require('child_process').spawn;

const noCache = require('./no_cache');

module.exports = function(opts, req, res) {
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
        noCache(res);
        var d = self.dirMap(opts.repo);
        serviceRespond(self, opts.service, d, res);
    }
};

function serviceRespond(self, service, file, res) {
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
}
