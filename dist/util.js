"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAction = exports.parseGitName = exports.infoResponse = exports.serviceRespond = exports.onExit = exports.basicAuth = exports.noCache = void 0;
const child_process_1 = require("child_process");
const http_duplex_1 = require("./http-duplex");
const service_1 = require("./service");
/**
 * adds headers to the response object to add cache control
 * @param  res  - http response
 */
function noCache(res) {
    res.setHeader("expires", "Fri, 01 Jan 1980 00:00:00 GMT");
    res.setHeader("pragma", "no-cache");
    res.setHeader("cache-control", "no-cache, max-age=0, must-revalidate");
}
exports.noCache = noCache;
/**
 * sets and parses basic auth headers if they exist
 * @param  req  - http request object
 * @param  res  - http response
 * @param  callback - function(username, password)
 */
function basicAuth(req, res, callback) {
    if (!req.headers["authorization"]) {
        res.setHeader("Content-Type", "text/plain");
        res.setHeader("WWW-Authenticate", 'Basic realm="authorization needed"');
        res.writeHead(401);
        res.end("401 Unauthorized");
    }
    else {
        const tokens = req.headers["authorization"].split(" ");
        if (tokens[0] === "Basic") {
            const splitHash = Buffer.from(tokens[1], "base64")
                .toString("utf8")
                .split(":");
            const username = splitHash.shift();
            const password = splitHash.join(":");
            callback(username, password);
        }
    }
}
exports.basicAuth = basicAuth;
/**
 * returns when process has fully exited
 * @param  ps - event emitter to listen to
 * @param  callback - function(code, signature)
 */
function onExit(ps, callback) {
    let code;
    let sig;
    let pending = 3;
    const onend = () => {
        if (--pending === 0) {
            callback(code, sig);
        }
    };
    ps.on("exit", (c, s) => {
        code = c;
        sig = s;
    });
    ps.on("exit", onend);
}
exports.onExit = onExit;
/**
 * execute given git operation and respond
 * @param  dup  - duplex object to catch errors
 * @param  service - the method that is responding infoResponse (push, pull, clone)
 * @param  repoLocation - the repo path on disk
 * @param  res  - http response
 */
function serviceRespond(dup, service, repoLocation, res) {
    const pack = (s) => {
        const n = (4 + s.length).toString(16);
        return Array(4 - n.length + 1).join("0") + n + s;
    };
    res.write(pack("# service=git-" + service + "\n"));
    res.write("0000");
    const isWin = /^win/.test(process.platform);
    const cmd = isWin
        ? ["git", service, "--stateless-rpc", "--advertise-refs", repoLocation]
        : ["git-" + service, "--stateless-rpc", "--advertise-refs", repoLocation];
    const ps = (0, child_process_1.spawn)(cmd[0], cmd.slice(1));
    ps.on("error", (err) => {
        dup.emit("error", new Error(`${err.message} running command ${cmd.join(" ")}`));
    });
    ps.stdout.pipe(res);
}
exports.serviceRespond = serviceRespond;
/**
 * sends http response using the appropriate output from service call
 * @param  git     - an instance of git object
 * @param  repo    - the repository
 * @param  service - the method that is responding infoResponse (push, pull, clone)
 * @param  req  - http request object
 * @param  res  - http response
 */
function infoResponse(git, repo, service, req, res) {
    const dup = new http_duplex_1.HttpDuplex(req, res);
    dup.cwd = git.dirMap(repo);
    dup.repo = repo;
    dup.accept = dup.emit.bind(dup, "accept");
    dup.reject = dup.emit.bind(dup, "reject");
    dup.once("reject", (code) => {
        res.statusCode = code || 500;
        res.end();
    });
    const anyListeners = git.listeners("info").length > 0;
    git.exists(repo, (ex) => {
        dup.exists = ex;
        if (!ex && git.autoCreate) {
            dup.once("accept", () => {
                git.create(repo, next);
            });
            git.emit("info", dup);
            if (!anyListeners)
                dup.accept();
        }
        else if (!ex) {
            res.statusCode = 404;
            res.setHeader("content-type", "text/plain");
            res.end("repository not found");
        }
        else {
            dup.once("accept", next);
            git.emit("info", dup);
            if (!anyListeners)
                dup.accept();
        }
    });
    function next() {
        res.setHeader("content-type", "application/x-git-" + service + "-advertisement");
        noCache(res);
        serviceRespond(git, service, git.dirMap(repo), res);
    }
}
exports.infoResponse = infoResponse;
/**
 * parses a git string and returns the repo name
 * @param  repo - the raw repo name containing .git
 * @return returns the name of the repo
 */
function parseGitName(repo) {
    const locationOfGit = repo.lastIndexOf(".git");
    return repo.substr(0, locationOfGit > 0 ? locationOfGit : repo.length);
}
exports.parseGitName = parseGitName;
/**
 * responds with the correct service depending on the action
 * @method createAction
 * @param  opts - options to pass Service
 * @param  req  - http request object
 * @param  res  - http response
 * @return a service instance
 */
function createAction(opts, req, res) {
    const service = new service_1.Service(opts, req, res);
    // TODO: see if this works or not
    // Object.keys(opts).forEach((key) => {
    //   service[key] = opts[key];
    // });
    return service;
}
exports.createAction = createAction;
