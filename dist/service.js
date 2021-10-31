"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Service = void 0;
const zlib_1 = __importDefault(require("zlib"));
const through_1 = __importDefault(require("through"));
const util_1 = __importDefault(require("util"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const http_duplex_1 = require("./http-duplex");
const headerRegex = {
    'receive-pack': '([0-9a-fA-F]+) ([0-9a-fA-F]+) refs\/(heads|tags)\/(.*?)( |00|\u0000)|^(0000)$',
    "upload-pack": "^\\S+ ([0-9a-fA-F]+)",
};
const decoder = {
    gzip: () => zlib_1.default.createGunzip(),
    deflate: () => zlib_1.default.createDeflate(),
};
const packSideband = (s) => {
    const n = (4 + s.length).toString(16);
    return Array(4 - n.length + 1).join("0") + n + s;
};
class Service extends http_duplex_1.HttpDuplex {
    /**
     * Handles invoking the git-*-pack binaries
     * @class Service
     * @extends HttpDuplex
     * @param  {Object}               opts - options to bootstrap the service object
     * @param  req  - http request object
     * @param  res  - http response
     */
    constructor(opts, req, res) {
        super(req, res);
        let data = "";
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        this.status = "pending";
        this.repo = opts.repo;
        this.service = opts.service;
        this.cwd = opts.cwd;
        this.logs = [];
        const buffered = (0, through_1.default)().pause();
        // stream needed to receive data after decoding, but before accepting
        const ts = (0, through_1.default)();
        const encoding = req.headers["content-encoding"];
        if (encoding && decoder[encoding]) {
            // data is compressed with gzip or deflate
            req.pipe(decoder[encoding]()).pipe(ts).pipe(buffered);
        }
        else {
            // data is not compressed
            req.pipe(ts).pipe(buffered);
        }
        if (req.headers["authorization"]) {
            const tokens = req.headers["authorization"].split(" ");
            if (tokens[0] === "Basic") {
                const splitHash = Buffer.from(tokens[1], "base64")
                    .toString("utf8")
                    .split(":");
                this.username = splitHash.shift();
            }
        }
        ts.once("data", function onData(chunk) {
            data += chunk;
            const ops = data.match(new RegExp(headerRegex[self.service], "gi"));
            if (!ops)
                return;
            data = "";
            ops.forEach(function (op) {
                let type;
                const m = op.match(new RegExp(headerRegex[self.service]));
                if (!m)
                    return;
                if (self.service === "receive-pack") {
                    self.last = m[1];
                    self.commit = m[2];
                    if (m[3] == "heads") {
                        type = "branch";
                        self.evName = "push";
                    }
                    else {
                        type = "version";
                        self.evName = "tag";
                    }
                    const headers = {
                        last: self.last,
                        commit: self.commit,
                    };
                    headers[type] = self[type] = m[4];
                    self.emit("header", headers);
                }
                else if (self.service === "upload-pack") {
                    self.commit = m[1];
                    self.evName = "fetch";
                    self.emit("header", {
                        commit: self.commit,
                    });
                }
            });
        });
        self.once("accept", function onAccept() {
            process.nextTick(function () {
                const cmd = os_1.default.platform() == "win32"
                    ? ["git", opts.service, "--stateless-rpc", opts.cwd]
                    : ["git-" + opts.service, "--stateless-rpc", opts.cwd];
                const ps = (0, child_process_1.spawn)(cmd[0], cmd.slice(1));
                ps.on("error", function (error) {
                    self.emit("error", new Error(`${error.message} running command ${cmd.join(" ")}`));
                });
                self.emit("service", ps);
                const respStream = (0, through_1.default)(function write(c) {
                    if (self.listeners("response").length === 0) {
                        if (self.logs.length > 0) {
                            while (self.logs.length > 0) {
                                this.queue(self.logs.pop());
                            }
                        }
                        return this.queue(c);
                    }
                    // prevent git from sending the close signal
                    if (c.length === 4 && c.toString() === "0000")
                        return;
                    this.queue(c);
                }, function end() {
                    if (self.listeners("response").length > 0)
                        return;
                    this.queue(null);
                });
                respStream.log = function () {
                    // eslint-disable-next-line prefer-rest-params
                    self.log(...arguments);
                };
                self.emit("response", respStream, function endResponse() {
                    res.queue(Buffer.from("0000"));
                    res.queue(null);
                });
                ps.stdout.pipe(respStream).pipe(res);
                buffered.pipe(ps.stdin);
                buffered.resume();
                ps.on("exit", () => {
                    if (self.logs.length > 0) {
                        while (self.logs.length > 0) {
                            respStream.queue(self.logs.pop());
                        }
                        respStream.queue(Buffer.from("0000"));
                        respStream.queue(null);
                    }
                    self.emit.bind(self, "exit");
                });
            });
        });
        self.once("reject", function onReject(code, msg) {
            res.statusCode = code;
            res.end(msg);
        });
    }
    log() {
        // eslint-disable-next-line prefer-rest-params
        const _log = util_1.default.format(...arguments);
        const SIDEBAND = String.fromCharCode(2); // PROGRESS
        const message = `${SIDEBAND}${_log}\n`;
        const formattedMessage = Buffer.from(packSideband(message));
        this.logs.unshift(formattedMessage.toString());
    }
    /**
     * reject request in flight
     * @param  code - http response code
     * @param  msg  - message that should be displayed on the client
     */
    reject(code, msg) {
        if (this.status !== "pending")
            return;
        if (msg === undefined && typeof code === "string") {
            msg = code;
            code = 500;
        }
        this.status = "rejected";
        this.emit("reject", code || 500, msg);
    }
    /**
     * accepts request to access resource
     */
    accept() {
        if (this.status !== "pending")
            return;
        this.status = "accepted";
        this.emit("accept");
    }
}
exports.Service = Service;
