import http from "http";
import zlib from "zlib";
import through, { ThroughStream } from "through";
import util from "util";
import os from "os";
import { spawn } from "child_process";

import { HttpDuplex } from "./http-duplex";
import { ServiceString } from "./types";
import { packSideband } from "./util";

const headerRegex: { [key: string]: string } = {
  'receive-pack': '([0-9a-fA-F]+) ([0-9a-fA-F]+) refs\/(heads|tags)\/(.*?)( |00|\u0000)|^(0000)$', // eslint-disable-line
  "upload-pack": "^\\S+ ([0-9a-fA-F]+)",
};

const decoder: { [key: string]: () => zlib.Gunzip | zlib.Deflate } = {
  gzip: (): zlib.Gunzip => zlib.createGunzip(),
  deflate: (): zlib.Deflate => zlib.createDeflate(),
};
export interface ServiceOptions {
  repo: string;
  cwd: string;
  service: ServiceString;
}

export class Service extends HttpDuplex {
  status: string;
  repo: string;
  service: string;
  cwd: string;
  logs: string[];
  last: string | undefined;
  commit: string | undefined;
  evName: string | undefined;
  username: string | undefined;

  /**
   * Handles invoking the git-*-pack binaries
   * @class Service
   * @extends HttpDuplex
   * @param  {Object}               opts - options to bootstrap the service object
   * @param  req  - http request object
   * @param  res  - http response
   */
  constructor(
    opts: ServiceOptions,
    req: http.IncomingMessage,
    res: http.ServerResponse
  ) {
    super(req, res);

    let data = "";
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    this.status = "pending";
    this.repo = opts.repo;
    this.service = opts.service;
    this.cwd = opts.cwd;
    this.logs = [];

    const buffered = through().pause();

    // stream needed to receive data after decoding, but before accepting
    const ts = through();

    const encoding = req.headers["content-encoding"];

    if (encoding && decoder[encoding]) {
      // data is compressed with gzip or deflate
      req.pipe(decoder[encoding]()).pipe(ts).pipe(buffered);
    } else {
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

    ts.once("data", function onData(chunk: string) {
      data += chunk;

      const ops = data.match(new RegExp(headerRegex[self.service], "gi"));
      if (!ops) return;
      data = "";

      ops.forEach(function (op) {
        let type;
        const m = op.match(new RegExp(headerRegex[self.service]));

        if (!m) return;

        if (self.service === "receive-pack") {
          self.last = m[1];
          self.commit = m[2];

          if (m[3] == "heads") {
            type = "branch";
            self.evName = "push";
          } else {
            type = "version";
            self.evName = "tag";
          }

          const headers: { [key: string]: string } = {
            last: self.last,
            commit: self.commit,
          };
          headers[type] = (self as any)[type] = m[4];
          self.emit("header", headers);
        } else if (self.service === "upload-pack") {
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
        const cmd =
          os.platform() == "win32"
            ? ["git", opts.service, "--stateless-rpc", opts.cwd]
            : ["git-" + opts.service, "--stateless-rpc", opts.cwd];

        const ps = spawn(cmd[0], cmd.slice(1));

        ps.on("error", function (error: Error) {
          self.emit(
            "error",
            new Error(`${error.message} running command ${cmd.join(" ")}`)
          );
        });

        self.emit("service", ps);

        const respStream = through(
          function write(this: ThroughStream, c) {
            if (self.listeners("response").length === 0) {
              if (self.logs.length > 0) {
                while (self.logs.length > 0) {
                  this.queue(self.logs.pop());
                }
              }

              return this.queue(c);
            }
            // prevent git from sending the close signal
            if (c.length === 4 && c.toString() === "0000") return;
            this.queue(c);
          },
          function end(this: ThroughStream) {
            if (self.listeners("response").length > 0) return;

            this.queue(null);
          }
        );

        (respStream as any).log = function () {
          // eslint-disable-next-line prefer-rest-params
          (self as any).log(...arguments);
        };

        self.emit("response", respStream, function endResponse() {
          (res as any).queue(Buffer.from("0000"));
          (res as any).queue(null);
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

    self.once("reject", function onReject(code: number, msg: string) {
      res.statusCode = code;
      res.end(msg);
    });
  }

  log() {
    // eslint-disable-next-line prefer-rest-params
    const _log = util.format(...arguments);
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
  reject(code: number, msg: string) {
    if (this.status !== "pending") return;

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
    if (this.status !== "pending") return;

    this.status = "accepted";
    this.emit("accept");
  }
}
