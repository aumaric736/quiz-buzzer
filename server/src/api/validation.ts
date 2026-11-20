export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: Record<string, string | number | boolean | null>) {
    super(message);
    this.name = 'HttpError';
  }
}

export function requireNonEmptyString(value: unknown, fieldName: string, maxLength = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new HttpError(400, 'INVALID_INPUT', `${fieldName} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
