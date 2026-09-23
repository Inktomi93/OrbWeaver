// All `notifications`-table access (queries only). `seq` is db-driven via a `MAX(seq)+1` scalar subquery,
// never minted in JS. Every read/update WHERE-clause pins `recipientUserId`, so a foreign row matches
// nothing. markRead/dismiss set the timestamp via `COALESCE(col, :now)` so a re-flip keeps the original
// instant.

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { notifications } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { NotificationId } from "@orb/kit/ids";
import { and, asc, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";

/** A new notification row — the verb mints `id` + parses the closed `event` + passes its injected clock. */
interface NotificationInsert {
  id: NotificationId;
  recipientUserId: NotificationEvent["recipientUserId"];
  type: NotificationType;
  payload: NotificationEvent;
  createdAt: number;
}

/** The projected stored-row shape (file-local; the verbs turn it into the `InboxView` contract). */
interface NotificationRow {
  id: NotificationId;
  type: NotificationType;
  payload: NotificationEvent;
  seq: number;
  readAt: number | null;
  dismissedAt: number | null;
  createdAt: number;
}

// The columns every read projects (kept in sync with `NotificationRow`).
const ROW_COLS = {
  id: notifications.id,
  type: notifications.type,
  payload: notifications.payload,
  seq: notifications.seq,
  readAt: notifications.readAt,
  dismissedAt: notifications.dismissedAt,
  createdAt: notifications.createdAt,
} as const;

// Build the durable-first INSERT…RETURNING (unexecuted). File-local — the two executors below own the run.
function buildInsertNotification(db: Db, row: NotificationInsert): AwaitableBatchStmt<NotificationRow[]> {
  return db
    .insert(notifications)
    .values({
      id: row.id,
      recipientUserId: row.recipientUserId,
      type: row.type,
      payload: row.payload,
      createdAt: row.createdAt,
      seq: sql<number>`(select coalesce(max(${notifications.seq}), 0) + 1 from ${notifications} where ${notifications.recipientUserId} = ${row.recipientUserId})`,
    })
    .returning(ROW_COLS);
}

/** UNEXECUTED "dismiss every active row of one type for one recipient" (#1041) — the supersede half of a
 *  singleton delivery and the whole of a retract. Idempotent by the same `COALESCE` the per-row dismiss
 *  uses, so a row already dismissed keeps its original instant. Returned unexecuted because the supersede
 *  MUST ride the insert's own batch. */
function buildDismissActiveOfType(
  db: Db,
  recipientUserId: NotificationEvent["recipientUserId"],
  type: NotificationType,
  now: number,
): AwaitableBatchStmt<NotificationRow[]> {
  return db
    .update(notifications)
    .set({ dismissedAt: sql`coalesce(${notifications.dismissedAt}, ${now})` })
    .where(and(eq(notifications.recipientUserId, recipientUserId), eq(notifications.type, type), isNull(notifications.dismissedAt)))
    .returning(ROW_COLS);
}

/** UPDATE the payload of the recipient's ACTIVE row of one type, in place (#1041) — `seq`, `readAt` and
 *  `createdAt` are untouched, so a QUIET correction of a standing ask's own number never re-badges an inbox
 *  the reader already looked at. Returns the rows it changed: EMPTY means the reader has no active row of
 *  that type, which is a legitimate settled state (they dismissed it) and never a reason to insert one —
 *  resurrecting a dismissed ask is the re-prompt loop the aggregate exists to avoid.
 */
export async function updateActivePayloadOfType(
  db: Db,
  recipientUserId: NotificationEvent["recipientUserId"],
  payload: NotificationEvent,
): Promise<NotificationRow[]> {
  return await db
    .update(notifications)
    .set({ payload })
    .where(and(eq(notifications.recipientUserId, recipientUserId), eq(notifications.type, payload.type), isNull(notifications.dismissedAt)))
    .returning(ROW_COLS);
}

/** Retract a standing ask: dismiss every active row of `type` for `recipientUserId`; returns the rows that
 *  were actually flipped (the caller publishes them, so a live reader re-reads an inbox that no longer
 *  carries the ask). Empty when nothing stood. */
export async function dismissActiveOfType(
  db: Db,
  recipientUserId: NotificationEvent["recipientUserId"],
  type: NotificationType,
  now: number,
): Promise<NotificationRow[]> {
  return await buildDismissActiveOfType(db, recipientUserId, type, now);
}

/** What rides the INSERT's own batch. `coStatements` is the producer seam (membership transitions);
 *  `supersedeActiveOfSameType` is the #1041 singleton seam. Both are statements the INSERT must commit
 *  WITH, never before or after — which is why they are options here rather than two calls at the verb. */
interface InsertNotificationExtras {
  readonly coStatements?: readonly BatchStmt[];
  readonly supersedeActiveOfSameType?: boolean;
}

/** Durable-first INSERT (db-driven monotonic `seq`); returns the stored row.
 *
 *  With extras it becomes ONE `db.batch`: a crash can never leave a producer's membership transition
 *  committed with no durable notification, nor a superseded row dismissed with no replacement (or two
 *  live rows of a type that is supposed to have one). The after-commit bus fan-out is the caller's. */
export async function insertNotification(db: Db, row: NotificationInsert, extras: InsertNotificationExtras = {}): Promise<NotificationRow> {
  const preceding: BatchStmt[] = [...(extras.coStatements ?? [])];
  if (extras.supersedeActiveOfSameType === true) {
    preceding.push(buildDismissActiveOfType(db, row.recipientUserId, row.type, row.createdAt));
  }
  if (preceding.length === 0) {
    const inserted = await buildInsertNotification(db, row);
    return inserted[0] as NotificationRow;
  }
  const results = await db.batch(batchMany([...preceding, buildInsertNotification(db, row)]));
  // The INSERT is the last statement; it always yields exactly one RETURNING row.
  const inserted = results.at(-1) as NotificationRow[];
  return inserted[0] as NotificationRow;
}

/** The caller's active inbox page — recipient-scoped, dismissed excluded, newest-first by `seq`, paged with
 *  `seq < cursor` when a cursor is given. */
export async function selectInbox(
  db: Db,
  recipientUserId: NotificationEvent["recipientUserId"],
  cursor: number | undefined,
  limit: number,
): Promise<NotificationRow[]> {
  const scoped = and(
    eq(notifications.recipientUserId, recipientUserId),
    isNull(notifications.dismissedAt),
    cursor === undefined ? undefined : lt(notifications.seq, cursor),
  );
  return await db.select(ROW_COLS).from(notifications).where(scoped).orderBy(desc(notifications.seq)).limit(limit);
}

/** The RESUME page — recipient-scoped, dismissed excluded, `seq` strictly ABOVE the watermark, OLDEST-first.
 *
 *  THE ASCENDING ORDER IS THE WHOLE POINT (#1459). `selectInbox` walks DOWN from the newest row, so a bounded
 *  walk that stops before it reaches the resume watermark has skipped the MIDDLE of the log while holding its
 *  TOP — and a reader that delivers what it holds advances its watermark past rows it never read. Walking UP
 *  from the watermark makes a short page a contiguous PREFIX instead: whatever the caller delivered, the next
 *  page starts exactly one row above it. */
export async function selectInboxSince(
  db: Db,
  recipientUserId: NotificationEvent["recipientUserId"],
  afterSeq: number,
  limit: number,
): Promise<NotificationRow[]> {
  const scoped = and(eq(notifications.recipientUserId, recipientUserId), isNull(notifications.dismissedAt), gt(notifications.seq, afterSeq));
  return await db.select(ROW_COLS).from(notifications).where(scoped).orderBy(asc(notifications.seq)).limit(limit);
}

/** Idempotent recipient-scoped read-flip: set `readAt` only if currently null, pinned to the caller. Returns
 *  the row, or `undefined` when no row of the caller's matches the id.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export async function markReadScoped(
  db: Db,
  recipientUserId: NotificationEvent["recipientUserId"],
  notificationId: NotificationId,
  now: number,
): Promise<NotificationRow | undefined> {
  const updated = await db
    .update(notifications)
    .set({ readAt: sql`coalesce(${notifications.readAt}, ${now})` })
    .where(and(eq(notifications.id, notificationId), eq(notifications.recipientUserId, recipientUserId)))
    .returning(ROW_COLS);
  return updated[0];
}

/** Bulk recipient-scoped read-flip: set `readAt` on every one of the caller's unread rows in one UPDATE.
 *  Dismissed rows are included (dismissing doesn't imply read). Returns the count of rows touched. */
export async function markAllReadScoped(db: Db, recipientUserId: NotificationEvent["recipientUserId"], now: number): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.recipientUserId, recipientUserId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

/** Idempotent recipient-scoped dismiss-flip — `dismissedAt` set once; same scope/return as {@link markReadScoped}. */
export async function dismissScoped(
  db: Db,
  recipientUserId: NotificationEvent["recipientUserId"],
  notificationId: NotificationId,
  now: number,
): Promise<NotificationRow | undefined> {
  const updated = await db
    .update(notifications)
    .set({ dismissedAt: sql`coalesce(${notifications.dismissedAt}, ${now})` })
    .where(and(eq(notifications.id, notificationId), eq(notifications.recipientUserId, recipientUserId)))
    .returning(ROW_COLS);
  return updated[0];
}
