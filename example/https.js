const Server = require('./lib/git');
const path = require('path');
const fs = require('fs');
const repos = new Server(path.resolve(__dirname, 'tmp'), {
    autoCreate: true,
    authenticate: (type, repo, user, next) => {
      if(type == 'push') {
        user((username, password) => {
          console.log(username, password);
          next();
        });
      } else {
        next();
      }
    }
});

repos.on('push', (push) => {
    console.log('push ' + push.repo + '/' + push.commit
        + ' (' + push.branch + ')'
    );
    push.accept();
});

repos.on('fetch', (fetch) => {
    console.log('fetch ' + fetch.commit);
    fetch.accept();
});
const port = process.env.PORT || 7005;

var options = {
  port: 7006, //HTTPS Port
	key: fs.readFileSync('./privatekey.pem'), //Private Key For HTTPS
	cert: fs.readFileSync('./certificate.pem') //Certificate For HTTPS
};

repos.listen(port, options, (port, protocol) => {
  console.log(`node-git-server running at ${protocol}://localhost:${port}`)
});
