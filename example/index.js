var path = require('path');
var gitserver = require('../');
var repos = gitserver(path.resolve(__dirname, 'tmp'), { autoCreate : true });
var port = process.env.PORT || 7005;

repos.on('push', function (push) {
    console.log('push ' + push.repo + '/' + push.commit
        + ' (' + push.branch + ')'
    );
    push.accept();
});

repos.on('fetch', function (fetch) {
    console.log('fetch ' + fetch.repo + '/' + fetch.commit);
    fetch.accept();
});

repos.listen(port, function() {
    console.log(`node-git-server running at http://localhost:${port}`)
});
