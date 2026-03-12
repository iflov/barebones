import { normalizeHttpRoute } from './http-metrics.util';

describe('normalizeHttpRoute', () => {
  it('builds a normalized route pattern from baseUrl and route path', () => {
    expect(
      normalizeHttpRoute({
        baseUrl: '/v1/admin/users',
        route: {
          path: '/:id',
        },
      }),
    ).toBe('/v1/admin/users/:id');
  });

  it('returns the baseUrl when the route path is the root path', () => {
    expect(
      normalizeHttpRoute({
        baseUrl: '/v1/admin/health',
        route: {
          path: '/',
        },
      }),
    ).toBe('/v1/admin/health');
  });

  it('falls back to UNKNOWN when the request route is missing', () => {
    expect(
      normalizeHttpRoute({
        baseUrl: '/v1/admin/missing',
      }),
    ).toBe('UNKNOWN');
  });
});
