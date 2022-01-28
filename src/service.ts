import http from 'http';
import zlib from 'zlib';
import through from 'through';
import util from 'util';
import os from 'os';
import { spawn } from 'child_process';

import { HttpDuplex } from './http-duplex';
import { ServiceString } from './types';
import { packSideband } from './util';

const headerRegex: { [key: string]: string } = {
  'receive-pack': '([0-9a-fA-F]+) ([0-9a-fA-F]+) refs\/(heads|tags)\/(.*?)( |00|\u0000)|^(0000)$', // eslint-disable-line
  'upload-pack': '^\\S+ ([0-9a-fA-F]+)',
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

export class Service<T> extends HttpDuplex<T> {
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
   * @param  opts - options to bootstrap the service object
   * @param  req  - http request object
   * @param  res  - http response
   */
  constructor(
    opts: ServiceOptions,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: T | undefined
  ) {
    super(req, res, context);

    let data = '';

    this.status = 'pending';
    this.repo = opts.repo;
    this.service = opts.service;
    this.cwd = opts.cwd;
    this.logs = [];

    const buffered = through().pause();

    // stream needed to receive data after decoding, but before accepting
    const ts = through();

    const encoding = req.headers['content-encoding'];

    if (encoding && decoder[encoding]) {
      // data is compressed with gzip or deflate
      req.pipe(decoder[encoding]()).pipe(ts).pipe(buffered);
    } else {
      // data is not compressed
      req.pipe(ts).pipe(buffered);
    }

    if (req.headers['authorization']) {
      const tokens = req.headers['authorization'].split(' ');
      if (tokens[0] === 'Basic') {
        const splitHash = Buffer.from(tokens[1], 'base64')
          .toString('utf8')
          .split(':');
        this.username = splitHash.shift();
      }
    }

    ts.once('data', (chunk: string) => {
      data += chunk;

      const ops = data.match(new RegExp(headerRegex[this.service], 'gi'));
      if (!ops) return;
      data = '';

      ops.forEach((op) => {
        let type;
        const m = op.match(new RegExp(headerRegex[this.service]));

        if (!m) return;

        if (this.service === 'receive-pack') {
          this.last = m[1];
          this.commit = m[2];

          if (m[3] == 'heads') {
            type = 'branch';
            this.evName = 'push';
          } else {
            type = 'version';
            this.evName = 'tag';
          }

          const headers: { [key: string]: string } = {
            last: this.last,
            commit: this.commit,
          };
          headers[type] = (this as any)[type] = m[4];
          this.emit('header', headers);
        } else if (this.service === 'upload-pack') {
          this.commit = m[1];
          this.evName = 'fetch';
          this.emit('header', {
            commit: this.commit,
          });
        }
      });
    });

    this.once('accept', () => {
      process.nextTick(() => {
        const cmd =
          os.platform() == 'win32'
            ? ['git', opts.service, '--stateless-rpc', opts.cwd]
            : ['git-' + opts.service, '--stateless-rpc', opts.cwd];

        const ps = spawn(cmd[0], cmd.slice(1));

        ps.on('error', (error: Error) => {
          this.emit(
            'error',
            new Error(`${error.message} running command ${cmd.join(' ')}`)
          );
        });

        this.emit('service', ps);

        const respStream = through(
          // write
          (c: any) => {
            if (this.listeners('response').length === 0) {
              if (this.logs.length > 0) {
                while (this.logs.length > 0) {
                  respStream.queue(this.logs.pop());
                }
              }

              return respStream.queue(c);
            }
            // prevent git from sending the close signal
            if (c.length === 4 && c.toString() === '0000') return;
            respStream.queue(c);
          },
          // read
          () => {
            if (this.listeners('response').length > 0) return;

            respStream.queue(null);
          }
        );

        (respStream as any).log = this.log.bind(this);

        this.emit('response', respStream, function endResponse() {
          (res as any).queue(Buffer.from('0000'));
          (res as any).queue(null);
        });

        ps.stdout.pipe(respStream).pipe(res);

        buffered.pipe(ps.stdin);
        buffered.resume();

        ps.on('exit', () => {
          if (this.logs.length > 0) {
            while (this.logs.length > 0) {
              respStream.queue(this.logs.pop());
            }
            respStream.queue(Buffer.from('0000'));
            respStream.queue(null);
          }

          this.emit('exit');
        });
      });
    });

    this.once('reject', function onReject(code: number, msg: string) {
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
   */
  accept() {
    if (this.status !== 'pending') return;

    this.status = 'accepted';
    this.emit('accept');
  }
}
