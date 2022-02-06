import http from 'http';
import EventEmitter from 'events';

export class HttpDuplex extends EventEmitter {
  setHeader(arg0: string, arg1: string) {
    throw new Error('Method not implemented.');
  }
  end(reason?: any) {
    throw new Error('Method not implemented.');
  }
  destroy() {
    throw new Error('Method not implemented.');
  }
  accept() {
    throw new Error('Method not implemented.');
  }
  reject(code: number, msg: string) {
    throw new Error('Method not implemented.');
  }

  /**
   * A IncomingMessage created by http.Server or http.ClientRequest usually passed as the
   * first parameter to the 'request' and 'response' events. Implements Readable Stream interface
   * but may not be a decendant thereof.
   * @see {@link https://nodejs.org/api/http.html#http_event_request|request}
   * @see {@link https://nodejs.org/api/http.html#http_class_http_incomingmessage|http.IncomingMessage}
   *
   */
  req: http.IncomingMessage;

  /**
   * Created http.server. Passed as the second parameter to the 'request' event.
   * The response implements Writable Stream interface but isn't a descendent thereof.
   * @see {@link https://nodejs.org/api/http.html#http_event_request|request}
   * @see {@link https://nodejs.org/api/http.html#http_class_http_serverresponse|http.ServerResponse}
   */
  res: http.ServerResponse;
  cwd: string | undefined;
  repo: string | undefined;
  exists: boolean | undefined;

  /**
   * Constructs a proxy object over input and output resulting in a unified stream.
   * Generally meant to combine request and response streams in the http.request event
   * @see {@link https://nodejs.org/api/http.html#http_event_request|request}
   * @see {@link https://nodejs.org/api/http.html#http_class_http_incomingmessage|http.IncomingMessage}
   * @see {@link https://nodejs.org/api/http.html#http_class_http_serverresponse|http.ServerResponse}
   * @example <caption> A simple example is shown below </caption>

    ```js
    http.createServer(function (req, res) {
        var dup = new HttpDuplex(req, res);
        res.end("Request: " + req.method + " " + req.url);
    }).listen(80);
    ```
   */
  constructor(input: http.IncomingMessage, output: http.ServerResponse) {
    super();

    this.req = input;
    this.res = output;

    // request / input proxy events
    ['data', 'end', 'error', 'close'].forEach((name) => {
      this.req.on(name, this.emit.bind(this, name));
    });

    // respone / output proxy events
    ['error', 'drain'].forEach((name) => {
      this.res.on(name, this.emit.bind(this, name));
    });
  }

  get complete() {
    return this.req.complete;
  }

  /**
   * Reference to the underlying socket for the request connection.
   * @readonly
   * @see {@link https://nodejs.org/api/http.html#http_request_socket|request.Socket}
   */
  get connection() {
    return this.req.connection;
  }

  /**
   * Request/response headers. Key-value pairs of header names and values. Header names are always lower-case.
   * @readonly
   * @see {@link https://nodejs.org/api/http.html#http_message_headers|message.headers}
   */
  get headers() {
    return this.req.headers;
  }

  /**
   * Requested HTTP Version sent by the client. Usually either '1.0' or '1.1'
   * @see {@link https://nodejs.org/api/http.html#http_message_httpversion|message.httpVersion}
   * @readonly
   */
  get httpVersion() {
    return this.req.httpVersion;
  }

  /**
   * First integer in the httpVersion string
   * @see httpVersion
   * @readonly
   */
  get httpVersionMajor() {
    return this.req.httpVersionMajor;
  }

  /**
   * Second integer ni the httpVersion string
   * @see httpVersion
   * @readonly
   */
  get httpVersionMinor() {
    return this.req.httpVersionMinor;
  }

  /**
   * Request method of the incoming request.
   * @see {@link https://nodejs.org/api/http.html#http_event_request|request}
   * @see {@link https://nodejs.org/api/http.html#http_class_http_serverresponse|http.ServerResponse}
   * @example 'GET', 'DELETE'
   * @readonly
   */
  get method() {
    return this.req.method;
  }

  /**
   * Is this stream readable.
   * @readonly
   */
  get readable() {
    return this.req.readable;
  }

  /**
   * net.Socket object associated with the connection.
   * @see {@link https://nodejs.org/api/net.html#net_class_net_socket|net.Socket}
   * @readonly
   */
  get socket() {
    return this.req.socket;
  }

  /**
   * The HTTP status code. Generally assigned before sending headers for a response to a client.
   * @see {@link https://nodejs.org/api/http.html#http_response_statuscode|response.statusCode}
   * @example request.statusCode = 404;
   */
  get statusCode() {
    return this.res.statusCode;
  }

  set statusCode(val) {
    this.res.statusCode = val;
  }

  /**
   * Controls the status message sent to the client as long as an explicit call to response.writeHead() isn't made
   * If ignored or the value is undefined, the default message corresponding to the status code will be used.
   * @see {@link https://nodejs.org/api/http.html#http_response_statusmessage|response.statusMessage}
   * @example request.statusMessage = 'Document Not found';
   */
  get statusMessage() {
    return this.res.statusMessage;
  }

  set statusMessage(val) {
    this.res.statusMessage = val;
  }

  /**
   * Request/response trailer headers. Just like {@link headers} except these are only written
   * after the initial response to the client.
   * This object is only populated at the 'end' event and only work if a 'transfer-encoding: chunked'
   * header is sent in the initial response.
   * @readonly
   * @see headers
   * @see addTrailers
   * @see {@link https://nodejs.org/api/http.html#http_message_trailers|message.trailers}
   * @see {@link https://nodejs.org/api/http.html#http_response_addtrailers_headers|response.addTrailers}
   */
  get trailers() {
    return this.req.trailers;
  }

  /**
   * Request URL string.
   * @example <caption>A request made as:</caption>
   * GET /info?check=none HTTP/1.1
   * @example <caption>Will return the string</caption>
   * '/info?check=none'
   * @readonly
   */
  get url() {
    return this.req.url;
  }

  // output / response wrapping
  get writable() {
    return this.res.writable;
  }

  /**
   * Sends a response header to the client request. Must only be called one time and before calling response.end().
   * @param statusCode 3-digit HTTP status code, like 404
   * @param statusMessage - An optional human readable status message to send with the status code
   * @param headers - An object containing the response headers to send
   * @see {@link https://nodejs.org/api/http.html#http_response_writehead_statuscode_statusmessage_headers|response.writeHead}
   * @example var content = 'Under Construction...';
   * response.writeHead(200, {
   *     'Content-Length': Buffer.byteLength(content),
   *     'Content-Type': 'text/plain'
   * });
   * response.end(content);
   */
  writeHead(statusCode: number, statusMessage: string, headers: string[]) {
    this.res.writeHead(statusCode, statusMessage, headers);
    return this;
  }

  /**
   * Buffers written data in memory. This data will be flushed when either the uncork or end methods are called.
   * @see uncork
   * @see {@link https://nodejs.org/api/stream.html#stream_writable_cork|stream.Writeable.cork}
   * @example
   * request.cork();
   * request.write('buffer data ');
   * request.write('before sending ');
   * request.uncork();
   */
  cork() {
    this.res.socket?.cork();
    return this;
  }

  /**
   * Flushes all data buffered since cork() was called.
   * @see cork
   * @see {@link https://nodejs.org/api/stream.html#stream_writable_uncork|stream.Writeable.uncork}
   */
  uncork() {
    this.res.socket?.uncork();
    return this;
  }
}

// proxy request methods
['pause', 'resume', 'setEncoding'].forEach(function (name) {
  (HttpDuplex.prototype as any)[name] = function () {
    // eslint-disable-next-line prefer-rest-params
    return (this.req as any)[name].apply(this.req, Array.from(arguments));
  };
});

// proxy respone methods
[
  'setDefaultEncoding',
  'write',
  'end',
  'flush',
  'writeHeader',
  'writeContinue',
  'setHeader',
  'getHeader',
  'removeHeader',
  'addTrailers',
].forEach(function (name) {
  (HttpDuplex.prototype as any)[name] = function () {
    // eslint-disable-next-line prefer-rest-params
    return (this.res as any)[name].apply(this.res, Array.from(arguments));
  };
});

/**
 * Destroys object and it's bound streams
 */
HttpDuplex.prototype.destroy = function () {
  this.req.destroy();
  this.res.destroy();
};
