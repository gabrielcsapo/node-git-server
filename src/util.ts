import http from 'http';
import { spawn } from 'child_process';

import { Git } from './git';
import { HttpDuplex } from './http-duplex';
import { Service, ServiceOptions } from './service';
import { ServiceString } from './types';

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

/**
 * sets and parses basic auth headers if they exist
 * @param  req  - http request object
 * @param  res  - http response
 * @param  callback - function(username, password)
 */
export function basicAuth(
  req: http.IncomingMessage,
  res: http.ServerResponse
): [string | undefined, string | undefined] | undefined {
  if (!req.headers['authorization']) {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('WWW-Authenticate', 'Basic realm="authorization needed"');
    res.writeHead(401);
    res.end('401 Unauthorized');
  } else {
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
  return undefined;
}
/**
 * execute given git operation and respond
 * @param  dup  - duplex object to catch errors
 * @param  service - the method that is responding infoResponse (push, pull, clone)
 * @param  repoLocation - the repo path on disk
 * @param  res  - http response
 */
export function serviceRespond(
  dup: HttpDuplex | Git<any>,
  service: ServiceString,
  repoLocation: string,
  res: http.ServerResponse
) {
  res.write(packSideband('# service=git-' + service + '\n'));
  res.write('0000');

  const isWin = /^win/.test(process.platform);

  const cmd = isWin
    ? ['git', service, '--stateless-rpc', '--advertise-refs', repoLocation]
    : ['git-' + service, '--stateless-rpc', '--advertise-refs', repoLocation];

  const ps = spawn(cmd[0], cmd.slice(1));

  ps.on('error', (err) => {
    dup.emit(
      'error',
      new Error(`${err.message} running command ${cmd.join(' ')}`)
    );
  });
  ps.stdout.pipe(res);
}
/**
 * sends http response using the appropriate output from service call
 * @param  git     - an instance of git object
 * @param  repo    - the repository
 * @param  service - the method that is responding infoResponse (push, pull, clone)
 * @param  req  - http request object
 * @param  res  - http response
 */
export function infoResponse(
  git: Git<any>,
  repo: string,
  service: ServiceString,
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  function next() {
    res.setHeader(
      'content-type',
      'application/x-git-' + service + '-advertisement'
    );
    noCache(res);
    serviceRespond(git, service, git.dirMap(repo), res);
  }

  const dup = new HttpDuplex(req, res);
  dup.cwd = git.dirMap(repo);
  dup.repo = repo;

  dup.accept = dup.emit.bind(dup, 'accept');
  dup.reject = dup.emit.bind(dup, 'reject');

  dup.once('reject', (code: number) => {
    res.statusCode = code || 500;
    res.end();
  });

  const anyListeners = git.listeners('info').length > 0;

  const exists = git.exists(repo);
  dup.exists = exists;

  if (!exists && git.autoCreate) {
    dup.once('accept', () => {
      git.create(repo, next);
    });

    git.emit('info', dup);
    if (!anyListeners) dup.accept();
  } else if (!exists) {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/plain');
    res.end('repository not found');
  } else {
    dup.once('accept', next);
    git.emit('info', dup);

    if (!anyListeners) dup.accept();
  }
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
