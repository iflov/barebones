import dayjs from 'dayjs';

import { toIsoString } from './date.util.js';

describe('toIsoString', () => {
  it('formats dates with dayjs', () => {
    const value = toIsoString('2026-03-11T10:00:00.000Z');

    expect(value).toBe(dayjs('2026-03-11T10:00:00.000Z').toISOString());
  });
});
