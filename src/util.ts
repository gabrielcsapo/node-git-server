import http from 'http';

import { Service, ServiceOptions } from './service';

export function packSideband(s: string): string {
  const n = (4 + s.length).toString(16);
  return Array(4 - n.length + 1).join('0') + n + s;
}

/**
 * adds headers to the response object to add cache control
 * @param  res  - http response
 */
export function noCache(res: http.ServerResponse) {
  res.setHeader('expires', 'Fri, 01 Jan 1980 00:00:00 GMT');
  res.setHeader('pragma', 'no-cache');
  res.setHeader('cache-control', 'no-cache, max-age=0, must-revalidate');
}

export class BasicAuthError extends Error {}

/**
 * sets and parses basic auth headers if they exist
 * @param  req  - http request object
 * @param  res  - http response
 * @param  callback - function(username, password)
 */
export function basicAuth(
  req: http.IncomingMessage
): [string | undefined, string | undefined] {
  if (req.headers['authorization']) {
    const tokens = req.headers['authorization'].split(' ');
    if (tokens[0] === 'Basic') {
      const splitHash = Buffer.from(tokens[1], 'base64')
        .toString('utf8')
        .split(':');
      const username = splitHash.shift();
      const password = splitHash.join(':');
      return [username, password];
    }
  }
  throw new BasicAuthError();
}

/**
 * parses a git string and returns the repo name
 * @param  repo - the raw repo name containing .git
 */
export function parseGitName(repo: string): string {
  const locationOfGit = repo.lastIndexOf('.git');
  return repo.slice(0, locationOfGit > 0 ? locationOfGit : repo.length);
}
/**
 * responds with the correct service depending on the action
 * @param  opts - options to pass Service
 * @param  req  - http request object
 * @param  res  - http response
 */
export function createAction<T>(
  opts: ServiceOptions,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  context: T | undefined
): Service<T> {
  const service = new Service(opts, req, res, context);

  // TODO: see if this works or not
  // Object.keys(opts).forEach((key) => {
  //   service[key] = opts[key];
  // });

  return service;
}
