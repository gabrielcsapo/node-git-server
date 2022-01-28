import { basicAuth, BasicAuthError, noCache, parseGitName } from './util';

describe('util', () => {
  describe('basicAuth', () => {
    test('should throw error if headers invalid or missing', () => {
      const req: any = {
        headers: {},
      };

      expect(basicAuth.bind(null, req)).toThrow(new BasicAuthError());
    });

    test('should accept headers and return user & password tuple', () => {
      const req: any = {
        headers: {
          authorization: 'Basic T3BlbjpTZXNhbWU=',
        },
      };

      expect(basicAuth(req)).toStrictEqual(['Open', 'Sesame']);
    });
  });

  describe('noCache', () => {
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
