type LogLevel = 'info' | 'warn' | 'error';
type SafeFields = Record<string, string | number | boolean | null>;

const ALLOWED_FIELDS = new Set(['event', 'requestId', 'statusCode', 'durationMs', 'port', 'role', 'activityId', 'phase', 'revision']);

export function log(level: LogLevel, event: string, fields: SafeFields = {}): void {
  const safe: SafeFields = { event };
  for (const [key, value] of Object.entries(fields)) {
    if (ALLOWED_FIELDS.has(key) && typeof value !== 'string' || ALLOWED_FIELDS.has(key) && !/(token|secret|password|key|auth|credential|body)/i.test(key)) {
      safe[key] = value;
    }
  }
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, ...safe });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}
