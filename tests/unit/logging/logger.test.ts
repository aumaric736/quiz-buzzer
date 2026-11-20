import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '../../../server/src/logging/logger.js';

describe('safe structured logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps allowlisted fields and omits credential-like and raw body fields', () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    log('info', 'activity_created', { role: 'teacher', durationMs: 15, password: 'do-not-log', requestBody: 'secret-payload' } as never);
    expect(output).toHaveBeenCalledOnce();
    const line = String(output.mock.calls[0]?.[0]);
    expect(line).toContain('activity_created');
    expect(line).toContain('teacher');
    expect(line).not.toContain('do-not-log');
    expect(line).not.toContain('secret-payload');
  });
});
