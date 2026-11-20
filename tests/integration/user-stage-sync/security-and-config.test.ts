import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../../server/src/config/env.js';
import { log } from '../../../server/src/logging/logger.js';

describe('security and local configuration', () => {
  it('rejects a non-loopback service address', () => {
    expect(() => loadConfig({ HOST: '0.0.0.0', PORT: '3000', CLIENT_ORIGIN: 'http://127.0.0.1:5173', DATABASE_PATH: './data/test.sqlite' })).toThrow(/127\.0\.0\.1/);
  });

  it('ignores .env while keeping the safe .env.example visible to git', () => {
    execFileSync('git', ['check-ignore', '-q', '.env']);
    let exampleIgnored = false;
    try { execFileSync('git', ['check-ignore', '-q', '.env.example']); exampleIgnored = true; }
    catch { exampleIgnored = false; }
    expect(exampleIgnored).toBe(false);
  });

  it('omits credential values, authorization headers and raw request data from logs', () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    log('info', 'safe_event', { role: 'student', authorization: 'Bearer secret', apiKey: 'secret-key', requestBody: 'answer contents' } as never);
    const line = String(output.mock.calls[0]?.[0]);
    expect(line).toContain('safe_event');
    expect(line).toContain('student');
    expect(line).not.toMatch(/secret|answer contents|authorization|apiKey|requestBody/i);
    output.mockRestore();
  });
});
