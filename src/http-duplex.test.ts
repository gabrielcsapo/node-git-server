import { HttpDuplex } from './http-duplex';
import { createServer, Server } from 'http';
import fetch from 'node-fetch';
import { readFileSync, createReadStream } from 'fs';
import { AddressInfo } from 'net';

// eslint-disable-next-line no-undef
const selfSrc = readFileSync(__filename);

declare global {
  interface Object {
    serialize(): string;
    filterKeys(keys: string): object;
  }
  interface String {
    format(...args: any[]): string;
    streamlineLineEndings(ending?: string): string;
    streamlineSpace(): string;
    streamline(ending?: string): string;
  }
}

Object.prototype.serialize = (): string => {
  return JSON.stringify(this, null, 4);
};

Object.prototype.filterKeys = function (key: string) {
  Object.keys(this).forEach((i) => {
    if (i == key) delete (this as any)[i];
  });

  return this;
};

String.prototype.format = function () {
  // eslint-disable-next-line prefer-rest-params
  const args = Array.from(arguments);
  return this.replace(/{(\d+)}/g, function (match, number) {
    return typeof args[number] != 'undefined' ? args[number] : match;
  });
};

String.prototype.streamlineLineEndings = function (ending = '\n') {
  return this.replace(/[\r\n,\r,\n]+/g, ending);
};

String.prototype.streamlineSpace = function () {
  return this.replace(/[\f\t\v ]{2,}/g, ' ');
};

String.prototype.streamline = function (ending = '\n') {
  return this.streamlineSpace().streamlineLineEndings(ending);
};

describe('http-duplex', () => {
  let server: Server;

  beforeEach(() => {
    server = createServer(function (req, res) {
      const dup = new HttpDuplex(req, res);
      console.log(dup.method + " " + dup.url); // eslint-disable-line
      switch (dup.url) {
        case '/':
          dup.setHeader('content-type', 'text/plain');
          if (dup.method === 'POST') {
            let size = 0;
            dup.on('data', function (buf) {
              size += buf.length;
            });
            dup.on('end', function () {
              dup.end(size + '\n');
            });
          } else createReadStream(__filename).pipe(dup as any);
          break;
        case '/info':
          if (dup.method == 'GET') {
            dup.setHeader('content-type', 'text/plain');
            const output = (
              'Method: {0}\n' +
              'Path: {1}\n' +
              'Status: {2}\n' +
              'Http Version 1: {3}\n' +
              'Http Version 2: {4}\n' +
              'Headers: \n{5}\n' +
              'Trailers: {6}\n' +
              'Complete: {7}\n' +
              'Readable: {8}\n' +
              'Writeable: {9}\n' +
              'Connection: {10}\n' +
              'Socket: {11}\n'
            ).format(
              dup.method,
              dup.url,
              dup.statusCode,
              dup.httpVersion,
              '{0}.{1}'.format(dup.httpVersionMajor, dup.httpVersionMinor),
              JSON.stringify(dup.headers),
              JSON.stringify(dup.trailers),
              dup.complete,
              dup.readable,
              dup.writable,
              dup.connection,
              dup.socket
            );
            dup.end(output.streamline());
          } else {
            dup.statusCode = 400;
            dup.end('Bad Request');
          }
          break;
        default:
          dup.statusCode = 404;
          dup.end("File doesn't exist");
          break;
      }
    });
    server.listen(1010);
  });

  afterEach(() => {
    server.close();
  });

  test('should be able to handle requests', (done) => {
    jest.setTimeout(10000);

    expect.assertions(3);

    server.on('listening', async function () {
      const { port } = server.address() as AddressInfo;

      const u = `http://localhost:${port}/`;
      console.log(u);

      const response = await fetch(u);
      const body = await response.text();

      expect(String(body)).toBe(String(selfSrc));

      const response1 = await fetch(u, {
        method: 'post',
        body: 'beep boop\n',
        headers: { 'Content-Type': 'application/json' },
      });
      const body1 = await response1.text();
      expect(body1).toBe('10\n');

      const response2 = await fetch(u + 'info');
      const body2 = await response2.text();

      expect(String(body2.streamline())).toMatchInlineSnapshot(`
        "Method: GET
        Path: /info
        Status: 200
        Http Version 1: 1.1
        Http Version 2: 1.1
        Headers: 
        {\\"accept\\":\\"*/*\\"
        \\"user-agent\\":\\"node-fetch/1.0 (+https://github.com/bitinn/node-fetch)\\"
        \\"accept-encoding\\":\\"gzip
        deflate\\"
        \\"connection\\":\\"close\\"
        \\"host\\":\\"localhost:1010\\"}
        Trailers: {}
        Complete: false
        Readable: true
        Writeable: true
        Connection: [object Object]
        Socket: [object Object]
        "
      `);
      done();
    });
  });
});
