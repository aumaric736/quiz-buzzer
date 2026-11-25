import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../server/src/config/env.js';
import { resolve } from 'node:path';

const valid = { HOST: '127.0.0.1', PORT: '3000', CLIENT_ORIGIN: 'http://127.0.0.1:5173', DATABASE_PATH: './data/test.sqlite', TEACHER_USERNAME: 'teacher', TEACHER_PASSWORD: 'test-password' };

describe('loadConfig', () => {
  it('accepts valid loopback configuration', () => {
    expect(loadConfig(valid)).toEqual({ host: '127.0.0.1', port: 3000, clientOrigin: valid.CLIENT_ORIGIN, databasePath: resolve(process.cwd(), 'data/test.sqlite'), teacherUsername: 'teacher', teacherPassword: 'test-password' });
  });

  it('resolves the configured SQLite path from the repository root when launched in the server workspace', () => {
    const repositoryRoot = process.cwd();
    process.chdir(resolve(repositoryRoot, 'server'));
    try {
      expect(loadConfig(valid).databasePath).toBe(resolve(repositoryRoot, 'data/test.sqlite'));
    } finally { process.chdir(repositoryRoot); }
  });

  it('accepts a trusted classroom LAN bind and matching origin', () => {
    expect(loadConfig({ ...valid, HOST: '0.0.0.0', CLIENT_ORIGIN: 'http://192.168.1.44:5173' })).toMatchObject({ host: '0.0.0.0', clientOrigin: 'http://192.168.1.44:5173' });
  });

  it.each([
    ['HOST', 'public.example'], ['PORT', '0'], ['PORT', '65536'], ['PORT', 'not-a-port'],
    ['CLIENT_ORIGIN', 'https://example.com'],
    ['DATABASE_PATH', ' ']
  ])('rejects invalid %s with an actionable error', (key, value) => {
    const config = { ...valid, [key]: value };
    let message = '';
    try { loadConfig(config); } catch (error) { message = (error as Error).message; }
    expect(message.length).toBeGreaterThan(0);
    if (key === 'DATABASE_PATH' && value.trim()) expect(message).not.toContain(value.trim());
  });
});
