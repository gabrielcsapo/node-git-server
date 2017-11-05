const EventEmitter = require('events');

/** Updated/Simplified http-duplex replacement.
 * Creates a unified stream from the passed in streams input and output.
 * Generally meant to combine http.req (input) and http.res (output) streams
 * @class HttpDuplex
 * @extends EventEmitter
 */

class HttpDuplex extends EventEmitter {
    /**
     * Constructs a proxy object over input and output.
     * @constructor
     * @param {stream.readable} input - http request object
     * @param {stream.writeable} output - http response object
     */
    constructor(input, output) {
        super();

        this.req = input;
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

    get connection() {
        return this.req.connection;
    }

    get headers() {
        return this.req.headers;
    }

    get httpVersion() {
        return this.req.httpVersion;
    }

    get httpVersionMajor() {
        return this.req.httpVersionMajor;
    }

    get httpVersionMinor() {
        return this.req.httpVersionMinor;
    }

    get method() {
        return this.req.method;
    }

    get readable() {
        return this.req.readable;
    }

    get socket() {
        return this.req.socket;
    }

    get trailers() {
        return this.req.trailers;
    }

    get upgrade() {
        return this.req.upgrade;
    }

    get url() {
        return this.req.url;
    }

    // output / response wrapping
    get writable() {
        return this.res.writable;
    }

    get statusCode() {
        return this.res.statusCode;
    }

    set statusCode(val) {
        this.res.statusCode = val;
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
    'cork', 'uncork', 'setDefaultEncoding', 'write', 'end', 'flush', 'writeHeader', 'writeHead', 'writeContinue',
    'setHeader', 'getHeader', 'removeHeader', 'addTrailers'
].forEach(function (name) {
    HttpDuplex.prototype[name] = function () {
        return this.res[name].apply(this.res, Array.from(arguments));
    };
});

/**
  * destroys stream object and it's bound streams
  * @method destroy
  */
HttpDuplex.prototype.destroy = function () {
    this.req.destroy();
    this.res.destroy();
};

module.exports = HttpDuplex;