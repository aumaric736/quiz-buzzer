import { dirname, isAbsolute, resolve } from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export interface AppConfig {
  host: string;
  port: number;
  clientOrigin: string;
  databasePath: string;
  teacherUsername: string;
  teacherPassword: string;
}

export interface GoogleSheetsCredentials {
  serviceAccountEmail: string;
  privateKey: string;
}

function isTrustedLanHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) return true;
  if (isIP(host) === 4) {
    const octets = host.split('.').map(Number);
    return octets[0] === 10 || octets[0] === 192 && octets[1] === 168
      || octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31
      || octets[0] === 169 && octets[1] === 254;
  }
  if (isIP(host) === 6) return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
  return false;
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
  const host = env.HOST?.trim();
  if (!host || !(host === '0.0.0.0' || isTrustedLanHostname(host))) {
    throw new Error('HOST must be loopback or a trusted classroom LAN address.');
  }

  const port = Number(env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }

  const clientOrigin = env.CLIENT_ORIGIN;
  if (!clientOrigin) throw new Error('CLIENT_ORIGIN is required.');
  let originUrl: URL;
  try { originUrl = new URL(clientOrigin); } catch { throw new Error('CLIENT_ORIGIN must be a valid HTTP origin.'); }
  if (originUrl.protocol !== 'http:' || originUrl.origin !== clientOrigin || originUrl.username || originUrl.password || !isTrustedLanHostname(originUrl.hostname)) {
    throw new Error('CLIENT_ORIGIN must be a trusted classroom LAN HTTP origin without credentials, path, or query.');
  }

  const teacherUsername = env.TEACHER_USERNAME?.trim() ?? '';
  const teacherPassword = env.TEACHER_PASSWORD ?? '';
  if (!teacherUsername || !teacherPassword || teacherUsername.length > 100 || teacherPassword.length > 200) {
    throw new Error('TEACHER_USERNAME and TEACHER_PASSWORD must be configured with valid lengths.');
  }

  const databasePathValue = env.DATABASE_PATH?.trim();
  if (!databasePathValue || databasePathValue.includes('\0')) throw new Error('DATABASE_PATH must be a non-empty local path.');
  const databasePath = databasePathValue === ':memory:' || isAbsolute(databasePathValue)
    ? databasePathValue : resolve(repositoryRoot, databasePathValue);
  return { host, port, clientOrigin, databasePath, teacherUsername, teacherPassword };
}
