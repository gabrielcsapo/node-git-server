const { HttpDuplex } = require("../dist/http-duplex");
const http = require("http");
const fetch = require("node-fetch");
const fs = require("fs");
const selfSrc = fs.readFileSync(__filename);

Object.prototype.serialize = function () {
  return JSON.stringify(this, null, 4);
};

Object.prototype.filterKeys = function (key) {
  var obj = this;
  Object.keys(this).forEach(function (i) {
    if (i == key) delete obj[i];
  });

  return obj;
};

String.prototype.format = function () {
  var args = Array.from(arguments);
  return this.replace(/{(\d+)}/g, function (match, number) {
    return typeof args[number] != "undefined" ? args[number] : match;
  });
};

String.prototype.streamlineLineEndings = function (ending = "\n") {
  return this.replace(/[\r\n,\r,\n]+/g, ending);
};

String.prototype.streamlineSpace = function () {
  return this.replace(/[\f\t\v ]{2,}/g, " ");
};

String.prototype.streamline = function (ending = "\n") {
  return this.streamlineSpace().streamlineLineEndings(ending);
};

describe("http-duplex", () => {
  let server;

  beforeEach(() => {
    server = http.createServer(function (req, res) {
      var dup = new HttpDuplex(req, res);
      console.log(dup.method + " " + dup.url); // eslint-disable-line
      switch (dup.url) {
        case "/":
          dup.setHeader("content-type", "text/plain");
          if (dup.method === "POST") {
            var size = 0;
            dup.on("data", function (buf) {
              size += buf.length;
            });
            dup.on("end", function () {
              dup.end(size + "\n");
            });
          } else fs.createReadStream(__filename).pipe(dup);
          break;
        case "/info":
          if (dup.method == "GET") {
            dup.setHeader("content-type", "text/plain");
            var output = (
              "Method: {0}\n" +
              "Path: {1}\n" +
              "Status: {2}\n" +
              "Upgrade: {3}\n" +
              "Http Version 1: {4}\n" +
              "Http Version 2: {5}\n" +
              "Headers: \n{6}\n" +
              "Trailers: {7}\n" +
              "Complete: {8}\n" +
              "Readable: {9}\n" +
              "Writeable: {10}\n" +
              "Connection: {11}\n" +
              "Client: {12}\n" +
              "Socket: {13}\n"
            ).format(
              dup.method,
              dup.url,
              dup.statusCode,
              dup.upgrade,
              dup.httpVersion,
              "{0}.{1}".format(dup.httpVersionMajor, dup.httpVersionMinor),
              JSON.stringify(dup.headers),
              JSON.stringify(dup.trailers),
              dup.complete,
              dup.readable,
              dup.writeable,
              dup.connection,
              dup.client,
              dup.socket
            );
            dup.end(output.streamline());
          } else {
            dup.statusCode = 400;
            dup.end("Bad Request");
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

  test("should be able to handle requests", (done) => {
    expect.assertions(3);

    server.on("listening", async function () {
      var u = "http://localhost:" + server.address().port + "/";

      const response = await fetch(u);
      const body = await response.text();

      expect(String(body)).toBe(String(selfSrc));

      const response1 = await fetch(u, {
        method: "post",
        body: "beep boop\n",
        headers: { "Content-Type": "application/json" },
      });
      const body1 = await response1.text();
      expect(body1).toBe("10\n");

      const response2 = await fetch(u + "info");
      const body2 = await response2.text();

      expect(String(body2.streamline())).toMatchInlineSnapshot(`
        "Method: GET
        Path: /info
        Status: 200
        Upgrade: {3}
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
        Writeable: {10}
        Connection: [object Object]
        Client: {12}
        Socket: [object Object]
        "
      `);
      done();
    });
  });
});
