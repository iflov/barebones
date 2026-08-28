import { normalizeHttpRoute } from './http-metrics.util.js';

describe('normalizeHttpRoute', () => {
  it('builds a normalized route pattern from baseUrl and route path', () => {
    expect(
      normalizeHttpRoute({
        baseUrl: '/v1/system/items',
        route: {
          path: '/:id',
        },
      }),
    ).toBe('/v1/system/items/:id');
  });

  it('returns the baseUrl when the route path is the root path', () => {
    expect(
      normalizeHttpRoute({
        baseUrl: '/v1/system/health',
        route: {
          path: '/',
        },
      }),
    ).toBe('/v1/system/health');
  });

  it('falls back to UNKNOWN when the request route is missing', () => {
    expect(
      normalizeHttpRoute({
        baseUrl: '/v1/system/missing',
      }),
    ).toBe('UNKNOWN');
  });
});
