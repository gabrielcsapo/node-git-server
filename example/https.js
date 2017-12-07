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

//HTTPS Server On Port 7006
repos.listen('https', {
   port: 7006,
   key: fs.readFileSync('./privatekey.pem'),
   cert: fs.readFileSync('./certificate.pem')
}, (error, result) => {
  if(error) return console.error(`failed to start git-server because of error ${error}`);
  console.log(`node-git-server running at https://localhost:7006`);
});

//HTTP Server On Port 7005
repos.listen('http', 7005, (error, result) => {
  if(error) return console.error(`failed to start git-server because of error ${error}`);
  console.log(`node-git-server running at http://localhost:7005`);
});
