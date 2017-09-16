const test = require('tape');

const { basicAuth, noCache, parseGitName } = require('../lib/util');

test('util', (t) => {
  t.plan(3);

  t.test('basicAuth', (t) => {
    t.plan(2);

    t.test('should send back basic auth headers', (t) => {
      let code = 0;
      let headers = {};
      let status = 0;

      let res = {
        writeHead: function(_code) {
          code = _code;
        },
        setHeader: function(key, value) {
          headers[key] = value;
        },
        end: function(_status) {
          status = _status;
          t.equal(code, 401);
          t.deepEqual(headers, {
            'Content-Type': 'text/plain',
            'WWW-Authenticate': 'Basic realm="authorization needed"'
          });
          t.equal(status, '401 Unauthorized');
          t.end();
        }
      };
      basicAuth({
        headers: {}
      }, res, () => {
        t.fail('should not have entered this callback');
      });
    });

    t.test('should accept headers and call callback', (t) => {

      basicAuth({
        headers: {
          'authorization': 'Basic T3BlbjpTZXNhbWU='
        }
      }, {}, (username, password) => {
        t.equal(username, 'Open');
        t.equal(password, 'Sesame');
        t.end();
      });

    });
  });

  t.test('noCache', (t) => {
    let headers = {
      'persisted-header': 'I have been here foreveeeerrr'
    };

    let res = {
      setHeader: function(key, value) {
        headers[key] = value;
      }
    };
    noCache(res);
    t.deepEqual(headers, {
      'persisted-header': 'I have been here foreveeeerrr',
      'expires': 'Fri, 01 Jan 1980 00:00:00 GMT',
      'pragma': 'no-cache',
      'cache-control': 'no-cache, max-age=0, must-revalidate'
    });
    t.end();
  });

  t.test('parseGitName', (t) => {
    t.plan(2);

    t.test('should remove .git from repo name', (t) => {
      t.equal(parseGitName('test.git'), 'test');
      t.end();
    });

    t.test('should remove .git from the end of repo name but not in the middle', (t) => {
      t.equal(parseGitName('test.git.git'), 'test.git');
      t.end();
    });

  });

});
