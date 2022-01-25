import url from 'url';
import qs from 'querystring';
import http from 'http';
import { ServiceString } from './types';

const services: ServiceString[] = ['upload-pack', 'receive-pack'];

export class HttpError extends Error {
  constructor(public statusCode: number, public statusText: string) {
    super(statusText);
  }
}

interface ParsedServiceGitRequest {
  repo: string;
  route: 'info' | 'service';
  service: ServiceString;
}

interface ParsedHeadGitRequest {
  repo: string;
  route: 'head';
  service: null;
}

export type ParsedGitRequest = ParsedServiceGitRequest | ParsedHeadGitRequest;

export function parseRequest(req: http.IncomingMessage): ParsedGitRequest {
  const info = parseInfoRequest(req);
  if (info)
    return {
      repo: info.repo,
      route: 'info',
      service: info.service,
    };

  const head = parseHeadRequest(req);
  if (head)
    return {
      repo: head.repo,
      route: 'head',
      service: null,
    };

  const service = parseServiceRequest(req);
  if (service)
    return {
      repo: service.repo,
      route: 'service',
      service: service.service,
    };

  if (req.method !== 'GET' && req.method !== 'POST') {
    throw new HttpError(405, 'method not supported');
  }

  throw new HttpError(404, 'not found');
}

interface ParsedRequest {
  repo: string;
}

interface ParsedServiceRequest extends ParsedRequest {
  service: ServiceString;
}

function parseInfoRequest(
  req: http.IncomingMessage
): ParsedServiceRequest | undefined {
  if (req.method !== 'GET') return undefined;

  const u = url.parse(req.url || '');
  const m = u.pathname?.match(/\/(.+)\/info\/refs$/);
  if (!m) return undefined;

  const repo = validateRepoPath(m[1]);

  const params = qs.parse(u?.query || '');
  if (!params.service || typeof params.service !== 'string') {
    throw new HttpError(400, 'service parameter required');
  }

  const service = validateServiceName(params.service.replace(/^git-/, ''));

  return {
    repo,
    service,
  };
}

function parseServiceRequest(
  req: http.IncomingMessage
): ParsedServiceRequest | undefined {
  if (req.method !== 'POST') return undefined;
  const m = req.url?.match(/\/(.+)\/git-(.+)/);
  if (!m) return undefined;

  const repo = validateRepoPath(m[1]);
  const service = validateServiceName(m[2]);

  return {
    repo,
    service,
  };
}

function parseHeadRequest(
  req: http.IncomingMessage
): ParsedRequest | undefined {
  if (req.method !== 'GET') return undefined;

  const u = url.parse(req.url || '');
  const m = u.pathname?.match(/^\/(.+)\/HEAD$/);
  if (!m) return undefined;
  const repo = validateRepoPath(m[1]);

  return {
    repo,
  };
}

function validateRepoPath(repo: string) {
  if (/\.\./.test(repo)) throw new HttpError(404, 'not found');
  return repo;
}

function validateServiceName(service: string): ServiceString {
  if (services.indexOf(service as ServiceString) === -1)
    throw new HttpError(405, 'service not available');
  return service as ServiceString;
}
