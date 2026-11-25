import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';

export type ActivityOperationType = 'answer' | 'end';

/** Allocate a durable monotonically increasing sequence without storing answer content. */
export function recordActivityOperation(
  db: SqliteDatabase,
  activityId: string,
  operationType: ActivityOperationType,
  receivedAt = new Date().toISOString()
): number {
  const allocate = db.transaction(() => {
    const row = db.prepare('SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM activity_operation_receipts WHERE activity_id = ?')
      .get(activityId) as { next: number };
    db.prepare('INSERT INTO activity_operation_receipts (activity_id, sequence, operation_type, received_at) VALUES (?, ?, ?, ?)')
      .run(activityId, row.next, operationType, receivedAt);
    return row.next;
  });
  return allocate.immediate();
}
