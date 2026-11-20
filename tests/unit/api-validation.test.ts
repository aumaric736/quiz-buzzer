import { describe, expect, it } from 'vitest';
import { HttpError, isRecord, requireNonEmptyString } from '../../server/src/api/validation.js';

describe('API input validation', () => {
  it('trims a valid bounded string', () => {
    expect(requireNonEmptyString('  Group  ', 'group name')).toBe('Group');
  });

  it.each([undefined, null, 3, '', '   ', 'x'.repeat(201)])('rejects invalid string input %#', (input) => {
    expect(() => requireNonEmptyString(input, 'group name')).toThrow(HttpError);
  });

  it('recognizes only JSON objects as records', () => {
    expect(isRecord({ role: 'student' })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
  });
});
