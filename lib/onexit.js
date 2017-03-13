module.exports = (ps, cb) => {
    var pending = 3;
    var code, sig;

    const onend = () => {
        if (--pending === 0) {
            cb(code, sig);
        }
    };

    ps.on('exit', (c, s) => {
        code = c;
        sig = s;
    });

    ps.on('exit', onend);
    ps.stdout.on('end', onend);
    ps.stderr.on('end', onend);
};
