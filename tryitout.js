module.exports = {
    title: 'node-git-server',
    nav: {
      Source: 'https://github.com/gabrielcsapo/node-git-server',
      Docs: './code/index.html'
    },
    body: `
      <div style="width:80%;position:absolute;top:50%;transform:translateY(-50%);">
        <h3 class="text-center" style="font-weight: 100"> A configurable git server written in Node.js </h3>
        <pre style="white-space: pre; width: 80%; margin: 0 auto;">
      const Server = require('node-git-server');
      const repo = new Server(path.resolve(__dirname, 'tmp'), {
          autoCreate: true,
          authenticate: (type, repo, username, password, next) => {
            console.log(type, repo, username, password);
            next();
          }
      });
      const port = process.env.PORT || 7005;

      repos.on('push', (push) =&gt; {
        console.log('push ' + push.repo + '/' + push.commit
          + ' (' + push.branch + ')'
        );
        push.accept();
      });

      repos.on('fetch', (fetch) =&gt; {
        console.log('fetch ' + fetch.commit);
        fetch.accept();
      });

      repos.listen(port, () =&gt; {
        console.log(\`node-git-server running at http://localhost:{port}\`)
      });
        </pre>
      </div>
    `,
    options: {
      width: '80%'
    },
    footer: {
      author: 'Made with ❤️ Gabriel J. Csapo',
      website: 'http://www.gabrielcsapo.com'
    }
}
