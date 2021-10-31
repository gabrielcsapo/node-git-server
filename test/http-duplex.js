var test = require("tap").test;
var { HttpDuplex } = require("../dist/http-duplex");
var http = require("http");
var request = require("request");
var fs = require("fs");
var selfSrc = fs.readFileSync(__filename);

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

var server = http.createServer(function (req, res) {
  var dup = new HttpDuplex(req, res);
    console.log(dup.method + ' ' + dup.url); // eslint-disable-line

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
          dup.headers.filterKeys("undefined").serialize(),
          dup.trailers.serialize(),
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

test("http-duplex", (t) => {
  t.plan(3);

  server.listen(0);
  server.on("listening", function () {
    var u = "http://localhost:" + server.address().port + "/";

    request(u, function (err, res, body) {
      if (err) t.fail(err);
      t.equal(String(body), String(selfSrc));
    });

    var r = request.post(u, function (err, res, body) {
      if (err) t.fail(err);
      t.equal(body, "10\n");
    });
    r.end("beep boop\n");

    request(u + "info", function (err, res, body) {
      if (err) t.fail(err);
      var check =
        "Method: GET\n" +
        "Path: /info\n" +
        "Status: 200\n" +
        "Upgrade: {3}\n" +
        "Http Version 1: 1.1\n" +
        "Http Version 2: 1.1\n" +
        "Headers: \n" +
        "{\n" +
        ' "host": "localhost:' +
        server.address().port +
        '",\n' +
        ' "connection": "close"\n' +
        "}\n" +
        "Trailers: {}\n" +
        "Complete: false\n" +
        "Readable: true\n" +
        "Writeable: {10}\n" +
        "Connection: [object Object]\n" +
        "Client: {12}\n" +
        "Socket: [object Object]\n";

      t.equal(String(body.streamline()), String(check.streamline()));
    });
  });

  t.on("end", function () {
    server.close();
  });
});
