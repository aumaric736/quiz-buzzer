import { afterEach, describe, expect, it, vi } from 'vitest';
import { restoreApplicationSession } from '../../../client/src/features/user-stage-sync/services/session-restore.js';

describe('expired student session acceptance', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('clears the remembered identity when the server rejects an expired session so enrollment starts fresh', async () => {
    const values = new Map<string, string>([['quiz-buzzer.session-id', 'expired-session']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'SESSION_NOT_FOUND', message: 'Session expired' }), {
      status: 404, headers: { 'content-type': 'application/json' }
    })));

    await expect(restoreApplicationSession('expired-session', 'http://local.test')).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect(values.get('quiz-buzzer.session-id')).toBeUndefined();
  });
});
