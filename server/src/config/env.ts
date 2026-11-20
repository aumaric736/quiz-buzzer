import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export interface AppConfig {
  host: '127.0.0.1';
  port: number;
  clientOrigin: string;
  databasePath: string;
}

export interface GoogleSheetsCredentials {
  serviceAccountEmail: string;
  privateKey: string;
}

/**
 * Returns null when Sheets is not configured so the local app can still start.
 * A Sheets operation must call this and present the resulting configuration
 * error before making any Google request.
 */
export function loadGoogleSheetsCredentials(env: NodeJS.ProcessEnv = process.env): GoogleSheetsCredentials | null {
  const serviceAccountEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? '';
  const privateKey = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() ?? '';

  if (!serviceAccountEmail && !privateKey) return null;
  if (!serviceAccountEmail || !privateKey) {
    throw new Error('Both Google Sheets service account environment variables must be configured.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(serviceAccountEmail)) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL must be a valid service account email address.');
  }
  if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('GOOGLE_PRIVATE_KEY must be a valid PEM private key.');
  }
  return { serviceAccountEmail, privateKey };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = env.HOST;
  if (host !== '127.0.0.1') throw new Error('HOST must be 127.0.0.1 for local-only access.');

  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }

  const clientOrigin = env.CLIENT_ORIGIN;
  if (!clientOrigin) throw new Error('CLIENT_ORIGIN is required.');
  let originUrl: URL;
  try { originUrl = new URL(clientOrigin); } catch { throw new Error('CLIENT_ORIGIN must be a valid local HTTP origin.'); }
  if (originUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(originUrl.hostname) || originUrl.origin !== clientOrigin) {
    throw new Error('CLIENT_ORIGIN must be an HTTP origin on localhost or 127.0.0.1.');
  }

  const databasePathValue = env.DATABASE_PATH?.trim();
  if (!databasePathValue || databasePathValue.includes('\0')) throw new Error('DATABASE_PATH must be a non-empty local path.');
  const databasePath = databasePathValue === ':memory:' || isAbsolute(databasePathValue)
    ? databasePathValue : resolve(repositoryRoot, databasePathValue);
  return { host, port, clientOrigin, databasePath };
}
