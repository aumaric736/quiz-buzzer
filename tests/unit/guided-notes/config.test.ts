import { describe, expect, it } from 'vitest';
import { loadGoogleSheetsCredentials } from '../../../server/src/config/env.js';

const privateKey = '-----BEGIN PRIVATE KEY-----\\nunit-test-placeholder\\n-----END PRIVATE KEY-----';

describe('loadGoogleSheetsCredentials', () => {
  it('allows the local app to start when the optional Sheets integration is not configured', () => {
    expect(loadGoogleSheetsCredentials({})).toBeNull();
  });

  it('normalizes escaped newlines in a complete service-account configuration', () => {
    expect(loadGoogleSheetsCredentials({
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'quiz-bot@example.iam.gserviceaccount.com',
      GOOGLE_PRIVATE_KEY: privateKey
    })).toEqual({
      serviceAccountEmail: 'quiz-bot@example.iam.gserviceaccount.com',
      privateKey: '-----BEGIN PRIVATE KEY-----\nunit-test-placeholder\n-----END PRIVATE KEY-----'
    });
  });

  it.each([
    [{ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'quiz-bot@example.iam.gserviceaccount.com' }, 'unit-test-placeholder'],
    [{ GOOGLE_PRIVATE_KEY: privateKey }, 'unit-test-placeholder'],
    [{ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'not-an-email', GOOGLE_PRIVATE_KEY: privateKey }, 'unit-test-placeholder'],
    [{ GOOGLE_SERVICE_ACCOUNT_EMAIL: 'quiz-bot@example.iam.gserviceaccount.com', GOOGLE_PRIVATE_KEY: 'sensitive-test-placeholder' }, 'sensitive-test-placeholder']
  ])('rejects partial or malformed credentials without echoing credential values', (env, sensitiveValue) => {
    let message = '';
    try { loadGoogleSheetsCredentials(env); } catch (error) { message = (error as Error).message; }
    expect(message).toBeTruthy();
    expect(message).not.toContain(sensitiveValue);
  });
});
