import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { UserSession } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../persistence/database.js';

export interface TeacherCredentials { username: string; password: string }

function sameSecret(candidate: string, expected: string): boolean {
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function authenticateTeacher(db: SqliteDatabase, credentials: TeacherCredentials | null, input: unknown): UserSession {
  if (!credentials || typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', '帳號或密碼錯誤。');
  }
  const { username, password } = input as Record<string, unknown>;
  const candidateUser = typeof username === 'string' ? username : '';
  const candidatePassword = typeof password === 'string' ? password : '';
  const validUser = sameSecret(candidateUser, credentials.username);
  const validPassword = sameSecret(candidatePassword, credentials.password);
  const valid = Number(validUser) & Number(validPassword);
  if (!valid) throw new HttpError(401, 'INVALID_CREDENTIALS', '帳號或密碼錯誤。');
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO user_sessions (id, role, authenticated_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, 'teacher', now, now);
  return { sessionId, role: 'teacher', activityId: null, groupId: null };
}
