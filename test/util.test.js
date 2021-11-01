const { basicAuth, noCache, parseGitName } = require('../dist/util');

describe('util', () => {
  describe('basicAuth', () => {
    test('should send back basic auth headers', (done) => {
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
          expect(code).toBe(401);
          expect(headers).toEqual({
            'Content-Type': 'text/plain',
            'WWW-Authenticate': 'Basic realm="authorization needed"'
          });
          expect(status).toBe('401 Unauthorized');
          done();
        }
      };
      basicAuth({
        headers: {}
      }, res, () => {
        expect.fail('should not have entered this callback');
        done();
      });
    });

    test('should accept headers and call callback', (done) => {
      basicAuth({
        headers: {
          'authorization': 'Basic T3BlbjpTZXNhbWU='
        }
      }, {}, (username, password) => {
        expect(username).toBe('Open');
        expect(password).toBe('Sesame');
        done();
      });
    });
  });

  describe('noCache', () => {
    let headers = {
      'persisted-header': 'I have been here foreveeeerrr'
    };

    let res = {
      setHeader: function(key, value) {
        headers[key] = value;
      }
    };
    noCache(res);
    expect(headers).toEqual({
      'persisted-header': 'I have been here foreveeeerrr',
      'expires': 'Fri, 01 Jan 1980 00:00:00 GMT',
      'pragma': 'no-cache',
      'cache-control': 'no-cache, max-age=0, must-revalidate'
    });
  });

  describe('parseGitName', () => {
    test('should remove .git from repo name', () => {
      expect(parseGitName('test.git')).toBe('test');
    });

    test('should remove .git from the end of repo name but not in the middle', () => {
      expect(parseGitName('test.git.git')).toBe('test.git');
    });

    test('if .git does not exist in the string, don\'t remove it', () => {
      expect(parseGitName('test')).toBe('test');
    });
  });

});
