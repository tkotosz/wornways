import { describe, expect, it } from 'vitest';
import { defaultActivityName } from '../../src/import/default-name.ts';

// The tests run with TZ=UTC, so local time is UTC here.
const at = (time: string) => Date.parse(`2026-05-02T${time}:00Z`);

describe('defaultActivityName', () => {
  it('names the part of the day the activity started in', () => {
    expect(defaultActivityName('ride', at('04:59'))).toBe('Night ride');
    expect(defaultActivityName('ride', at('05:00'))).toBe('Morning ride');
    expect(defaultActivityName('ride', at('12:00'))).toBe('Lunch ride');
    expect(defaultActivityName('ride', at('14:00'))).toBe('Afternoon ride');
    expect(defaultActivityName('ride', at('18:00'))).toBe('Evening ride');
    expect(defaultActivityName('ride', at('21:00'))).toBe('Night ride');
  });

  it('names the sport in plain words', () => {
    expect(defaultActivityName('virtual-ride', at('19:00'))).toBe('Evening virtual ride');
    expect(defaultActivityName('unknown', at('13:00'))).toBe('Lunch activity');
    expect(defaultActivityName('', at('13:00'))).toBe('Lunch activity');
  });
});
