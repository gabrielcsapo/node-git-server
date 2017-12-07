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

repos.listen({ httpPort: 7005, httpsPort:7006, key: fs.readFileSync('./privatekey.pem'), cert: fs.readFileSync('./certificate.pem')}, (error, result) => {
  console.log(result); //Returning Undefined
  var protocol = "?";
  var port = "?";
  console.log(`node-git-server running at ${protocol}://localhost:${port}`)
});
