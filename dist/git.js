"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Git = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const url_1 = __importDefault(require("url"));
const querystring_1 = __importDefault(require("querystring"));
const http_duplex_1 = require("./http-duplex");
const child_process_1 = require("child_process");
const events_1 = require("events");
const util_1 = require("./util");
const services = ["upload-pack", "receive-pack"];
class Git extends events_1.EventEmitter {
    /**
     *
     * Handles invoking the git-*-pack binaries
     * @param  repoDir   - Create a new repository collection from the directory `repoDir`. `repoDir` should be entirely empty except for git repo directories. If `repoDir` is a function, `repoDir(repo)` will be used to dynamically resolve project directories. The return value of `repoDir(repo)` should be a string path specifying where to put the string `repo`. Make sure to return the same value for `repo` every time since `repoDir(repo)` will be called multiple times.
     * @param  options - options that can be applied on the new instance being created
     * @param  options.autoCreate - By default, repository targets will be created if they don't exist. You can
     disable that behavior with `options.autoCreate = true`
     * @param  options.authenticate - a function that has the following arguments ({ type, repo, username, password, headers }, next) and will be called when a request comes through if set
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
     * @param  options.checkout - If `opts.checkout` is true, create and expected checked-out repos instead of bare repos
    */
    constructor(repoDir, options = {}) {
        super();
        if (typeof repoDir === "function") {
            this.dirMap = repoDir;
        }
        else {
            this.dirMap = (dir) => {
                return path_1.default.normalize((dir ? path_1.default.join(repoDir, dir) : repoDir));
            };
        }
        if (options.authenticate) {
            this.authenticate = options.authenticate;
        }
        this.autoCreate = options.autoCreate === false ? false : true;
        this.checkout = options.checkout;
    }
    /**
     * Get a list of all the repositories
     * @param  {Function} callback function to be called when repositories have been found `function(error, repos)`
     */
    list(callback) {
        fs_1.default.readdir(this.dirMap(), (error, results) => {
            if (error)
                return callback(error);
            const repos = results.filter((r) => {
                return r.substring(r.length - 3, r.length) == "git";
            }, []);
            callback(undefined, repos);
        });
    }
    /**
     * Find out whether `repoName` exists in the callback `cb(exists)`.
     * @param  repo - name of the repo
     * @param  callback - function to be called when finished
     */
    exists(repo, callback) {
        fs_1.default.exists(this.dirMap(repo), callback);
    }
    /**
     * Create a subdirectory `dir` in the repo dir with a callback.
     * @param  dir - directory name
     * @param  callback  - callback to be called when finished
     */
    mkdir(dir, callback) {
        // TODO: remove sync operations
        const parts = this.dirMap(dir).split(path_1.default.sep);
        for (let i = 0; i <= parts.length; i++) {
            const directory = parts.slice(0, i).join(path_1.default.sep);
            if (directory && !fs_1.default.existsSync(directory)) {
                fs_1.default.mkdirSync(directory);
            }
        }
        callback();
    }
    /**
     * Create a new bare repository `repoName` in the instance repository directory.
     * @param  repo - the name of the repo
     * @param  callback - Optionally get a callback `cb(err)` to be notified when the repository was created.
     */
    create(repo, callback) {
        function next(self) {
            let ps;
            let _error = "";
            const dir = self.dirMap(repo);
            if (self.checkout) {
                ps = (0, child_process_1.spawn)("git", ["init", dir]);
            }
            else {
                ps = (0, child_process_1.spawn)("git", ["init", "--bare", dir]);
            }
            ps.stderr.on("data", function (chunk) {
                _error += chunk;
            });
            (0, util_1.onExit)(ps, function (code) {
                if (!callback) {
                    return;
                }
                else if (code)
                    callback(new Error(_error));
                else
                    callback();
            });
        }
        if (typeof callback !== "function")
            callback = () => {
                return;
            };
        if (!/\.git$/.test(repo))
            repo += ".git";
        this.exists(repo, (ex) => {
            if (!ex) {
                this.mkdir(repo, () => {
                    next(this);
                });
            }
            else {
                next(this);
            }
        });
    }
    /**
     * returns the typeof service being process
     * @method getType
     * @param  {String} service - the service type
     * @return {String}  - will respond with either fetch or push
     */
    getType(service) {
        switch (service) {
            case "upload-pack":
                return "fetch";
            case "receive-pack":
                return "push";
            default:
                return "unknown";
        }
    }
    /**
     * Handle incoming HTTP requests with a connect-style middleware
     * @method handle
     * @memberof Git
     * @param  req - http request object
     * @param  res - http response object
     */
    handle(req, res) {
        const handlers = [
            (req, res) => {
                if (req.method !== "GET")
                    return false;
                // eslint-disable-next-line @typescript-eslint/no-this-alias
                const u = url_1.default.parse(req?.url || "");
                const m = u.pathname?.match(/\/(.+)\/info\/refs$/);
                if (!m)
                    return false;
                if (/\.\./.test(m[1]))
                    return false;
                const repo = m[1];
                const params = querystring_1.default.parse(u?.query || "");
                if (!params.service || typeof params.service !== "string") {
                    res.statusCode = 400;
                    res.end("service parameter required");
                    return;
                }
                const service = params.service.replace(/^git-/, "");
                if (services.indexOf(service) < 0) {
                    res.statusCode = 405;
                    res.end("service not available");
                    return;
                }
                const repoName = (0, util_1.parseGitName)(m[1]);
                const next = (error) => {
                    if (error) {
                        res.setHeader("Content-Type", "text/plain");
                        res.setHeader("WWW-Authenticate", 'Basic realm="authorization needed"');
                        res.writeHead(401);
                        res.end(typeof error === "string" ? error : error.toString());
                        return;
                    }
                    else {
                        return (0, util_1.infoResponse)(this, repo, service, req, res);
                    }
                };
                // check if the repo is authenticated
                if (this.authenticate) {
                    const type = this.getType(service);
                    const headers = req.headers;
                    const user = util_1.basicAuth.bind(null, req, res);
                    const promise = this.authenticate({ type, repo: repoName, user, headers }, (error) => {
                        return next(error);
                    });
                    if (promise instanceof Promise) {
                        return promise.then(next).catch(next);
                    }
                }
                else {
                    return next();
                }
            },
            (req, res) => {
                if (req.method !== "GET")
                    return false;
                const u = url_1.default.parse(req.url || "");
                const m = u.pathname?.match(/^\/(.+)\/HEAD$/);
                if (!m)
                    return false;
                if (/\.\./.test(m[1]))
                    return false;
                const repo = m[1];
                const next = () => {
                    const file = this.dirMap(path_1.default.join(m[1], "HEAD"));
                    this.exists(file, (exists) => {
                        if (exists) {
                            fs_1.default.createReadStream(file).pipe(res);
                        }
                        else {
                            res.statusCode = 404;
                            res.end("not found");
                        }
                    });
                };
                this.exists(repo, (exists) => {
                    const anyListeners = self.listeners("head").length > 0;
                    const dup = new http_duplex_1.HttpDuplex(req, res);
                    dup.exists = exists;
                    dup.repo = repo;
                    dup.cwd = this.dirMap(repo);
                    dup.accept = dup.emit.bind(dup, "accept");
                    dup.reject = dup.emit.bind(dup, "reject");
                    dup.once("reject", (code) => {
                        dup.statusCode = code || 500;
                        dup.end();
                    });
                    if (!exists && self.autoCreate) {
                        dup.once("accept", (dir) => {
                            self.create(dir || repo, next);
                        });
                        self.emit("head", dup);
                        if (!anyListeners)
                            dup.accept();
                    }
                    else if (!exists) {
                        res.statusCode = 404;
                        res.setHeader("content-type", "text/plain");
                        res.end("repository not found");
                    }
                    else {
                        dup.once("accept", next);
                        self.emit("head", dup);
                        if (!anyListeners)
                            dup.accept();
                    }
                });
            },
            (req, res) => {
                if (req.method !== "POST")
                    return false;
                const m = req.url?.match(/\/(.+)\/git-(.+)/);
                if (!m)
                    return false;
                if (/\.\./.test(m[1]))
                    return false;
                const repo = m[1], service = m[2];
                if (services.indexOf(service) < 0) {
                    res.statusCode = 405;
                    res.end("service not available");
                    return;
                }
                res.setHeader("content-type", "application/x-git-" + service + "-result");
                (0, util_1.noCache)(res);
                const action = (0, util_1.createAction)({
                    repo: repo,
                    service: service,
                    cwd: self.dirMap(repo),
                }, req, res);
                action.on("header", () => {
                    const evName = action.evName;
                    if (evName) {
                        const anyListeners = self.listeners(evName).length > 0;
                        self.emit(evName, action);
                        if (!anyListeners)
                            action.accept();
                    }
                });
            },
            (req, res) => {
                if (req.method !== "GET" && req.method !== "POST") {
                    res.statusCode = 405;
                    res.end("method not supported");
                }
                else {
                    return false;
                }
            },
            (req, res) => {
                res.statusCode = 404;
                res.end("not found");
            },
        ];
        res.setHeader("connection", "close");
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        (function next(ix) {
            const x = handlers[ix].call(self, req, res);
            if (x === false)
                next(ix + 1);
        })(0);
    }
    /**
     * starts a git server on the given port
     * @method listen
     * @memberof Git
     * @param  port  - the port to start the server on
     * @param  {Object=}   options  - the options to add extended functionality to the server
     * @param  {String=}   options.type - this is either https or http (the default is http)
     * @param  {Buffer|String=}   options.key - the key file for the https server
     * @param  {Buffer|String=}   options.cert - the cert file for the https server
     * @param  {Function} callback - the function to call when server is started or error has occured
     * @return {Git}  - the Git instance, useful for chaining
     */
    listen(port, options, callback) {
        if (typeof options == "function" || !options) {
            callback = options;
            options = { type: "http" };
        }
        const createServer = options.type == "http"
            ? http_1.default.createServer
            : https_1.default.createServer.bind(this, options);
        this.server = createServer((req, res) => {
            this.handle(req, res);
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
            this.server?.close((err) => {
                err ? reject(err) : resolve("Success");
            });
        });
    }
}
exports.Git = Git;
