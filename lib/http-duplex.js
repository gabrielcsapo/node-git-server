const EventEmitter = require('events');

class HttpDuplex extends EventEmitter {
    /**
     * Constructs a proxy object over input and output resulting in a unified stream.
     * Generally meant to combine request and response streams in the http.request event
     * @class HttpDuplex
     * @param {http.IncomingMessage} input - client request object from request event
     * @param {http.ServerResponse} output - response object from request event
     * @requires events
     * @extends EventEmitter
     * @see {@link https://nodejs.org/api/http.html#http_event_request|request}
     * @see {@link https://nodejs.org/api/http.html#http_class_http_incomingmessage|http.IncomingMessage}
     * @see {@link https://nodejs.org/api/http.html#http_class_http_serverresponse|http.ServerResponse}
     * @example <caption>A simple example is shown below</caption>
     * http.createServer(function (req, res) {
     *     var dup = new HttpDuplex(req, res);
     *     res.end("Request: " + req.method + " " + req.url);
     * }).listen(80);
     */
    constructor(input, output) {
        super();

        /**
          * A IncomingMessage created by http.Server or http.ClientRequest usually passed as the
          * first parameter to the 'request' and 'response' events. Implements Readable Stream interface
          * but may not be a decendant thereof.
          * @type {http.IncomingMessage}
          * @see {@link https://nodejs.org/api/http.html#http_event_request|request}
          * @see {@link https://nodejs.org/api/http.html#http_class_http_incomingmessage|http.IncomingMessage}
          *
          */
        this.req = input;

        /**
          * Created http.server. Passed as the second parameter to the 'request' event.
          * The response implements Writable Stream interface but isn't a descendent thereof.
          * @type {http.ServerResponse}
          * @see {@link https://nodejs.org/api/http.html#http_event_request|request}
          * @see {@link https://nodejs.org/api/http.html#http_class_http_serverresponse|http.ServerResponse}
          */
        this.res = output;

        var self = this;

        // request / input proxy events
        ['data', 'end', 'error', 'close'].forEach(function (name) {
            self.req.on(name, self.emit.bind(self, name));
        });

        // respone / output proxy events
        ['error', 'drain'].forEach(function (name) {
            self.res.on(name, self.emit.bind(self, name));
        });
    }

    // input / request wrapping
    get client() {
        return this.req.client;
    }

    get complete() {
        return this.req.complete;
    }

    /**
      * Reference to the underlying socket for the request connection.
      * @type {net.Socket}
      * @readonly
      * @see {@link https://nodejs.org/api/http.html#http_request_socket|request.Socket}
      */
    get connection() {
        return this.req.connection;
    }

    /**
     * Request/response headers. Key-value pairs of header names and values. Header names are always lower-case.
     * @name headers
     * @alias HttpDuplex.headers
     * @memberof HttpDuplex
     * @type {Object}
     * @readonly
     * @see {@link https://nodejs.org/api/http.html#http_message_headers|message.headers}
     */
    get headers() {
        return this.req.headers;
    }

    /**
     * Requested HTTP Version sent by the client. Usually either '1.0' or '1.1'
     * @name httpVersion
     * @alias HttpDuplex.httpVersion
     * @memberof HttpDuplex
     * @type {String}
     * @see {@link https://nodejs.org/api/http.html#http_message_httpversion|message.httpVersion}
     * @readonly
     */
    get httpVersion() {
        return this.req.httpVersion;
    }

    /**
     * First integer in the httpVersion string
     * @name httpVersionMajor
     * @alias HttpDuplex.httpVersionMajor
     * @memberof HttpDuplex
     * @type {Number}
     * @see httpVersion
     * @readonly
     */
    get httpVersionMajor() {
        return this.req.httpVersionMajor;
    }

    /**
     * Second integer ni the httpVersion string
     * @name httpVersionMinor
     * @alias HttpDuplex.httpVersionMinor
     * @memberof HttpDuplex
     * @type {String}
     * @see httpVersion
     * @readonly
     */
    get httpVersionMinor() {
        return this.req.httpVersionMinor;
    }

    /**
      * Request method of the incoming request.
      * @type {String}
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
     * @type {Boolean}
     * @readonly
     */
    get readable() {
        return this.req.readable;
    }

    /**
      * net.Socket object associated with the connection.
      * @type net.Socket
      * @see {@link https://nodejs.org/api/net.html#net_class_net_socket|net.Socket}
      * @readonly
      */
    get socket() {
        return this.req.socket;
    }

    /**
     * The HTTP status code. Generally assigned before sending headers for a response to a client.
     * @type {Number}
     * @default 200
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
     * @type {String}
     * @default undefined
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
     * @name HttpDuplex#trailers
     * @type {Object}
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
      * Whether or not the client connection has been upgraded
      * @type {Boolean}
      * @see {@link https://nodejs.org/api/http.html#http_event_upgrade_1|upgrade}
      * @readonly
      */
    get upgrade() {
        return this.req.upgrade;
    }

    /**
     * Request URL string.
     * @example <caption>A request made as:</caption>
     * GET /info?check=none HTTP/1.1
     * @example <caption>Will return the string</caption>
     * '/info?check=none'
     * @type {String}
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
     * @method writeHead
     * @alias HttpDuplex.writeHead
     * @memberof HttpDuplex
     * @param {number} statusCode 3-digit HTTP status code, like 404
     * @param {string} [statusMessage] An optional human readable status message to send with the status code
     * @param {object} [headers] An object containing the response headers to send
     * @returns {this}
     * @see {@link https://nodejs.org/api/http.html#http_response_writehead_statuscode_statusmessage_headers|response.writeHead}
     * @example var content = 'Under Construction...';
     * response.writeHead(200, {
     *     'Content-Length': Buffer.byteLength(content),
     *     'Content-Type': 'text/plain' 
     * });
     * response.end(content);
     */
    writeHead(statusCode, statusMessage, headers) {
        this.res.writeHead(statusCode, statusMessage, headers);
        return this;
    }

    /**
     * Buffers written data in memory. This data will be flushed when either the uncork or end methods are called.
     * @method cork
     * @alias HttpDuplex.cork
     * @memberof HttpDuplex
     * @returns {this}
     * @see uncork
     * @see {@link https://nodejs.org/api/stream.html#stream_writable_cork|stream.Writeable.cork}
     * @example
     * request.cork();
     * request.write('buffer data ');
     * request.write('before sending ');
     * request.uncork();
     */
    cork() {
        this.res.connection.cork();
        return this;
    }

    /**
     * Flushes all data buffered since cork() was called.
     * @method uncork
     * @alias HttpDuplex.cork
     * @memberof HttpDuplex
     * @returns {this}
     * @see cork
     * @see {@link https://nodejs.org/api/stream.html#stream_writable_uncork|stream.Writeable.uncork}
     */
    uncork() {
        this.res.connection.uncork();
        return this;
    }
}

// proxy request methods
['pause', 'resume', 'setEncoding'].forEach(function (name) {
    HttpDuplex.prototype[name] = function () {
        return this.req[name].apply(this.req, Array.from(arguments));
    };
});

// proxy respone methods
[
    'setDefaultEncoding', 'write', 'end', 'flush', 'writeHeader', 'writeContinue',
    'setHeader', 'getHeader', 'removeHeader', 'addTrailers'
].forEach(function (name) {
    HttpDuplex.prototype[name] = function () {
        return this.res[name].apply(this.res, Array.from(arguments));
    };
});

/**
 * Destroys object and it's bound streams
 * @method destroy
 * @alias HttpDuplex.destroy
 * @memberof HttpDuplex
 */
HttpDuplex.prototype.destroy = function () {
    this.req.destroy();
    this.res.destroy();
};

module.exports = HttpDuplex;

/**
 * Event emitted when the underlying request connection is closed. This only occurs once per response.
 * @event close
 * @alias HttpDuplex#event:close
 * @memberof HttpDuplex
 * @see end
 * @see {@link https://nodejs.org/api/http.html#http_event_close_2|http.IncomingMessage/close}
 */

/**
 * This event is emitted when data on the stream can be consumed. This may occur whenever the stream is switched into
 * flowing mode by calling readable.pipe() or readable.resume() or by attaching a listener this event.<p/>
 * This event is emitted when readable.read() is called and a chunk of data becomes available.
 * Data will be passed as a string if the default encoding has been set using readable.setEncoding(); otherwise it's
 * passed as a Buffer.
 * @event data
 * @alias HttpDuplex#event:data
 * @param {(string|buffer|any)} chunk The chunk is either a buffer or string when the stream isn't operating
 *        in object mode. When the stream is in object mode, the chunk can be any JavaScript value other than null.
 * @memberof HttpDuplex
 * @see {@link https://nodejs.org/api/stream.html#stream_event_data|stream.Readable/data}
 */

/**
 * If a call to response.write(chunk) returns false, the drain event will be emitted once it is appropriate to
 * resume writing data to the stream.
 * @event drain
 * @alias HttpDuplex#event:drain
 * @memberof HttpDuplex
 * @see {@link https://nodejs.org/api/stream.html#stream_event_drain|stream.Writable/drain}
 */

/**
 * This event is emitted once no more consumable data is left on the readable stream.<p/>
 * *Note*: This is only emitted when all data is completely consumed.
 * @event end
 * @alias HttpDuplex#event:end
 * @memberof HttpDuplex
 * @see {@link https://nodejs.org/api/stream.html#stream_event_end|stream.Readable/end}
 */

/**
 * This event may be emitted one of the underlying Readable or Writable stream implementations at any time.
 * This may happen in the following cases:
 *    + if the underlying streams are unable to produce data because of an internal failure
 *    + if an attempt is made to push an invalid chunk of data.
 *    + if an error occurred while writing or piping data.<p/>
 *
 * The listener callback will be passed a single Error object.<br/>
 * *Note*: Streams are not closed when the event is emitted.
 * @event error
 * @alias HttpDuplex#event:error
 * @memberof HttpDuplex
 * @see {@link https://nodejs.org/api/stream.html#stream_event_error_1|stream.Readable/error}
 * @see {@link https://nodejs.org/api/stream.html#stream_event_error|stream.Writeable/error}
 */

/**
 * Adds trailing headers to the response.
 * Trailers will only be emitted if chunked encoding is enabled for the response; otherwise they are discarded.
 * @method addTrailers
 * @name addTrailers
 * @alias HttpDuplex.addTrailers
 * @memberof HttpDuplex
 * @param {Object} headers Trailing headers to add to the response
 * @see trailers
 * @see headers
 * @see {@link https://nodejs.org/api/http.html#http_message_trailers|message.trailers}
 * @see {@link https://nodejs.org/api/http.html#http_response_addtrailers_headers|response.addTrailers}
 */

/**
 * Tells the server the response headers and body have been sent and that the message should be considered complete.
 * This MUST be called on every response.
 * If data is specified, this behaves as if calling response.write(data, encoding) followed by response.end(callback).
 * If specified, the callback is called once the response stream is finished.
 * @method end
 * @alias HttpDuplex.end
 * @memberof HttpDuplex
 * @param {(string|Buffer)} data optional data to write to the response before closing the connection
 * @param {String} encoding Encoding that should be used to write the data
 * @param {function} callback Function to be called once the response stream is finished
 * @see {@link https://nodejs.org/api/http.html#http_response_end_data_encoding_callback|response.end}
 */

 /**
 * Returns the current value of a header; name is case insensitive.
 * @method getHeader
 * @alias HttpDuplex.getHeader
 * @memberof HttpDuplex
 * @param {String} name Header to get the value of
 * @returns {String}
 * @see {@link https://nodejs.org/api/http.html#http_request_getheader_name|getHeader}
 * @example
 * let contentType = request.getHeader('Content-Type');
 */

/**
 * Switch readable stream out of flowing mode and stop emitting 'data' events.
 * Any new data that becomes available during this time will stay buffered until resume is called.
 * @method pause
 * @alias HttpDuplex.pause
 * @memberof HttpDuplex
 * @see {@link https://nodejs.org/api/stream.html#stream_readable_pause|stream.Readable.pause}
 */

/**
 * Remove a header from the response headers.
 * @method removeHeader
 * @alias HttpDuplex.removeHeader
 * @memberof HttpDuplex
 * @param {String} name Header to remove
 * @see {@link https://nodejs.org/api/http.html#http_request_removeheader_name|removeHeader}
 * @example
 * request.removeHeader('Content-Type');
 */

/**
 * Switch readable stream back into flowing mode and restart emitting 'data' events.
 * This can be used to consume all data waiting without processing any of it.
 * @method resume
 * @alias HttpDuplex.resume
 * @memberof HttpDuplex
 * @see {@link https://nodejs.org/api/stream.html#stream_readable_resume|stream.Readable.resume}
 */

/**
 * Sets the character encoding for data written to the stream.
 * @method setDefaultEncoding
 * @alias HttpDuplex.setDefaultEncoding
 * @memberof HttpDuplex
 * @param encoding {String} new character encoding
 * @see setEncoding
 * @example request.setDefaultEncoding('utf8');
 */

/**
 * Sets the character encoding for data read from the stream.
 * @method setEncoding
 * @alias HttpDuplex.setEncoding
 * @memberof HttpDuplex
 * @param encoding {String} new character encoding
 * @see setDefaultEncoding
 * @example request.setEncoding('utf8');
 */

/**
 * Set a single header. If the header already exists, it will be replaced.
 * It's possible to use an array of strings in place of value to send multiple headers with the same name.
 * @method setHeader
 * @alias HttpDuplex.setHeader
 * @memberof HttpDuplex
 * @param {String} name Header to set
 * @param {string|string[]} value Value(s) to assign to header
 * @see removeHeader
 * @see {@link https://nodejs.org/api/http.html#http_request_setheader_name_value|setHeader}
 * @example <caption>Single value</caption>
 * request.setHeader('Content-Type', 'text/html');
 * @example <caption>Array of string value</caption>
 * request.setHeader('Set-Cookie', ['type=auth', 'language=javascript']);
 */

/**
 * Sends a chunk of the response body. This method may be called multiple times to provide successive parts of the
 * body.
 * <p>*Note:* If write() is called either before writeHead() or writeHead() just hasn't been called, it will switch * modes and flush the implicit headers that may be waiting before parts of this chunk are sent.<p/>
 * Node will buffer up to the first chunk of the body. Any additional calls to write() may be buffered as well
 * for packet efficiency purposes.</p>
 * Returns true if the entire data was flushed successfully to the kernel buffer. Returns false if all or part of
 * the data was buffered in memory.
 * @method write
 * @alias HttpDuplex.write
 * @memberof HttpDuplex
 * @param {(string|Buffer)} chunk chunk of data to send.
 * @param {String} [encoding='utf8'] If chunk is a string, this specifies how to encode it into a byte stream.
 * @param {function} [callback] Callback to call when this chunk of data is flushed.
 * @returns {Boolean}
 * @emits {@link event:drain|drain} Emitted when data was buffered and the buffer has become free for use again.
 * @see {@link https://nodejs.org/api/http.html#http_response_write_chunk_encoding_callback|http.ServerResponse.write}
 */

/**
 * Sends an HTTP/1.1 100 Continue message to the client.
 * @method writeContinue
 * @alias HttpDuplex.writeContinue
 * @memberof HttpDuplex
 * @see {@link https://nodejs.org/api/http.html#http_response_writecontinue|response.writeContinue}
 * {@link https://nodejs.org/api/http.html#http_event_checkcontinue|http.Server/checkContinue}
 */

/**
 * __Warning:__ This has been deprecated in node, __don't__ use it. Any apis that require this funtion should be
 * updated to use writeHead insted.
 * @method writeHeader
 * @alias HttpDuplex.writeHeader
 * @memberof HttpDuplex
 * @deprecated {@link https://nodejs.org/api/deprecations.html#deprecations_dep0063_serverresponse_prototype_writeheader|Node Deprecated}
 * @see writeHead
 */
