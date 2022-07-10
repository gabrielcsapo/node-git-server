import { basicAuth, noCache, parseGitName } from './util';

describe('util', () => {
  describe('basicAuth', () => {
    test('should send back basic auth headers', async () => {
      await new Promise((resolve, reject) => {
        const headers: any = {};

        const req: any = {
          headers: {},
        };

        const res: any = {
          writeHead: function (_code: number) {
            code = _code;
          },
          setHeader: function (key: string | number, value: any) {
            headers[key] = value;
          },
          end: function (_status: number) {
            status = _status;
            expect(code).toBe(401);
            expect(headers).toEqual({
              'Content-Type': 'text/plain',
              'WWW-Authenticate': 'Basic realm="authorization needed"',
            });
            expect(status).toBe('401 Unauthorized');
            resolve('passed');
          },
        };

        let code = 0;
        let status = 0;

        basicAuth(req, res, () => {
          reject('should not have entered this callback');
        });
      });
    });

    test('should accept headers and call callback', async () => {
      await new Promise((resolve) => {
        const req: any = {
          headers: {
            authorization: 'Basic T3BlbjpTZXNhbWU=',
          },
        };

        const res: any = {};

        basicAuth(req, res, (username, password) => {
          expect(username).toBe('Open');
          expect(password).toBe('Sesame');
          resolve('passed');
        });
      });
    });
  });

  describe('noCache', () => {
    test('should honor noCache', () => {
      const headers: any = {
        'persisted-header': 'I have been here foreveeeerrr',
      };

      const res: any = {
        setHeader: function (key: string | number, value: any) {
          headers[key] = value;
        },
      };
      noCache(res);
      expect(headers).toEqual({
        'persisted-header': 'I have been here foreveeeerrr',
        expires: 'Fri, 01 Jan 1980 00:00:00 GMT',
        pragma: 'no-cache',
        'cache-control': 'no-cache, max-age=0, must-revalidate',
      });
    });
  });

  describe('parseGitName', () => {
    test('should remove .git from repo name', () => {
      expect(parseGitName('test.git')).toBe('test');
    });

    test('should remove .git from the end of repo name but not in the middle', () => {
      expect(parseGitName('test.git.git')).toBe('test.git');
    });

    test("if .git does not exist in the string, don't remove it", () => {
      expect(parseGitName('test')).toBe('test');
    });
  });
});
