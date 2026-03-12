import type { Request } from 'express';

type RoutableRequest = Pick<Request, 'baseUrl'> & {
  route?: {
    path?: string | string[];
  };
};

function trimTrailingSlash(value: string): string {
  if (value === '/') {
    return value;
  }

  return value.replace(/\/+$/, '');
}

function normalizeFragment(value: string): string {
  if (value.length === 0) {
    return '';
  }

  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;

  return withLeadingSlash.replace(/\/{2,}/g, '/');
}

export function normalizeHttpRoute(request: RoutableRequest): string {
  const routePath = request.route?.path;

  if (routePath === undefined) {
    return 'UNKNOWN';
  }

  const normalizedRoutePath = Array.isArray(routePath)
    ? normalizeFragment(routePath[0] ?? '')
    : normalizeFragment(routePath);

  if (normalizedRoutePath.length === 0) {
    return 'UNKNOWN';
  }

  const normalizedBaseUrl = trimTrailingSlash(normalizeFragment(request.baseUrl ?? ''));
  const fullPath =
    normalizedRoutePath === '/'
      ? normalizedBaseUrl || '/'
      : `${normalizedBaseUrl}${normalizedRoutePath}`;

  return trimTrailingSlash(fullPath || '/');
}
