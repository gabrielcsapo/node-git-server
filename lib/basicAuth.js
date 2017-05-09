module.exports = function basicAuth(req, res, callback) {
    if(!req.headers["authorization"]) {
        res.setHeader("Content-Type", 'text/plain');
        res.setHeader("WWW-Authenticate", 'Basic realm="authorization needed"');
        res.writeHead(401);
        res.end('401 Unauthorized');
    } else {
        const tokens = req.headers["authorization"].split(" ");
        if (tokens[0] === "Basic") {
            const splitHash = new Buffer(tokens[1], 'base64').toString('utf8').split(":");
            const username = splitHash.shift();
            const password = splitHash.join(":");
            callback(username, password, null);
        }
    }
    return;
};
