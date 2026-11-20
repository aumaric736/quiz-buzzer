import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SqliteDatabase = Database.Database;
export const DEFAULT_MIGRATION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'migrations/001-user-stage-sync.sql');
const migrationsDirectory = dirname(DEFAULT_MIGRATION_PATH);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../');

export function openDatabase(databasePath: string): SqliteDatabase {
  const resolvedPath = databasePath === ':memory:' ? databasePath : isAbsolute(databasePath) ? databasePath : resolve(repositoryRoot, databasePath);
  if (resolvedPath !== ':memory:') mkdirSync(resolve(resolvedPath, '..'), { recursive: true });
  const db = new Database(resolvedPath);
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

export function applyMigrations(db: SqliteDatabase, migrationPath?: string): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const migrations = migrationPath
    ? [migrationPath]
    : readdirSync(migrationsDirectory)
      .filter((name) => /^\d{3}-.+\.sql$/.test(name))
      .sort()
      .map((name) => resolve(migrationsDirectory, name));
  const hasMigration = db.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  const recordMigration = db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)');

  for (const file of migrations) {
    const name = file.split(/[\\/]/).at(-1)!;
    if (hasMigration.get(name)) continue;
    const sql = readFileSync(file, 'utf8');
    db.transaction(() => {
      db.exec(sql);
      recordMigration.run(name, new Date().toISOString());
    })();
  }
}

export function inTransaction<T>(db: SqliteDatabase, operation: () => T): T {
  return db.transaction(operation)();
}
