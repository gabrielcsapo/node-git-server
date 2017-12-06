// You Can Use The Commands Below To Generate A Self Signed Certificate For Use With This Tutorial
// These Commands Require That You have 'openssl' installed on your system
// openssl genrsa -out privatekey.pem 1024
// openssl req -new -key privatekey.pem -out certrequest.csr
// openssl x509 -req -in certrequest.csr -signkey privatekey.pem -out certificate.pem

const Server = require('../');
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
