const url = require('url');
const qs = require('querystring');
const path = require('path');
const fs = require('fs');
const httpDuplex = require('http-duplex');

const basicAuth = require('./basicAuth');
const createAction = require('./service');
const noCache = require('./no_cache');
const infoResponse = require('./info');

const services = ['upload-pack', 'receive-pack'];

module.exports = function(req, res) {
    res.setHeader('connection', 'close');
    var self = this;
    (function next(ix) {
        var done = () => {
            next(ix + 1);
        };
        var x = handlers[ix].call(self, req, res, done);
        if (x === false) next(ix + 1);
    })(0);
};

var handlers = [];
handlers.push(function(req, res, done) {
    var self = this;
    var u = url.parse(req.url);
    var m = u.pathname.match(/\/(.+)\/info\/refs$/) || u.pathname.match(/\/(.+)\/git-receive-pack$/) || u.pathname.match(/\/(.+)\/git-upload-pack$/);
    if(!m) return false; // this action is not supported
    var repo = m[1];

    // check if the repo is authenticated
    if(self.repos && self.repos[repo] && self.repos[repo].username && self.repos[repo].password) {
        const config = self.repos[repo];

        basicAuth(req, res, function(username, password) {
            if(username == config.username && password == config.password) {
                return done();
            } else {
                res.setHeader("Content-Type", 'text/plain');
                res.setHeader("WWW-Authenticate", 'Basic realm="authorization needed"');
                res.writeHead(401);
                res.end('401 Unauthorized');
                return;
            }
        });
    } else {
        return done();
    }
});

handlers.push(function(req, res) {
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
});

handlers.push(function(req, res) {
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
});

handlers.push(function(req, res) {
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
});

handlers.push((req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
        res.statusCode = 405;
        res.end('method not supported');
    } else {
        return false;
    }
});

handlers.push((req, res) => {
    res.statusCode = 404;
    res.end('not found');
});
