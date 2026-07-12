// domain/notifications/persistence/queries — ALL `notifications`-table access (queries only; the verbs hold
// the business logic). Three properties are PHYSICS here:
//   • DURABLE-FIRST seq — the INSERT computes `seq` in ONE statement via a `MAX(seq)+1` scalar subquery
//     scoped to the recipient (SQLite evaluates it against the pre-insert table state). The monotonic
//     cursor is db-driven, never minted in JS (determinism); `unique(recipientUserId, seq)` is the backstop.
//   • RECIPIENT-SCOPE — every read/update WHERE-clause pins `recipientUserId`, so a row that isn't the
//     caller's matches NOTHING (the verb maps the empty match → not-found). A user cannot read/touch
//     another's inbox. This file NEVER imports/joins `users`
//     (no-direct-users-read): the recipient id arrives as a param from the resolved Principal / the event.
//   • IDEMPOTENT state flips — markRead/dismiss set the timestamp via `COALESCE(col, :now)`, so a re-flip
//     keeps the original instant (markRead/dismiss idempotence).
//
// The row shape is the file-local `NotificationRow` (NOT exported — no feature type leaks from persistence,
// no-inline-types); the verbs project it to the `InboxView` contract shape.

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { notifications } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { NotificationId } from "@orb/kit/ids";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";

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

// Build the durable-first INSERT…RETURNING (unexecuted); `seq` per the file-header PHYSICS above.
// File-local — the two executors below own the run.
function buildInsertNotification(
  db: Db,
  row: NotificationInsert,
): AwaitableBatchStmt<NotificationRow[]> {
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

/** Durable-first INSERT (db-driven monotonic `seq` — see file header); RETURNS the stored row. */
export async function insertNotification(
  db: Db,
  row: NotificationInsert,
): Promise<NotificationRow> {
  // The builder's honest RETURNING type is `NotificationRow[]` (payload branded `$type<NotificationEvent>`).
  const inserted = await buildInsertNotification(db, row);
  // The INSERT always yields exactly one row.
  return inserted[0] as NotificationRow;
}

/**
 * The PD-24 TX-ATOMIC INSERT: run the producer's membership-transition statements + the notification
 * INSERT in ONE `db.batch` (libSQL batch = one implicit transaction), so a crash can never leave the
 * transition committed with no durable notification (or vice versa). The INSERT rides LAST; its RETURNING
 * rows are read from the batch result (the db read seam). The after-commit fan-out is the caller's.
 */
export async function insertNotificationWith(
  db: Db,
  row: NotificationInsert,
  coStatements: readonly BatchStmt[],
): Promise<NotificationRow> {
  const results = await db.batch(batchMany([...coStatements, buildInsertNotification(db, row)]));
  // The INSERT is the last statement; it always yields exactly one RETURNING row.
  const inserted = results.at(-1) as NotificationRow[];
  return inserted[0] as NotificationRow;
}

/**
 * The caller's active inbox page — recipient-scoped, dismissed excluded, newest-first by `seq`, paged with
 * `seq < cursor` when a cursor is given. Fetches `limit` rows.
 */
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
  return await db
    .select(ROW_COLS)
    .from(notifications)
    .where(scoped)
    .orderBy(desc(notifications.seq))
    .limit(limit);
}

/**
 * Idempotent recipient-scoped read-flip: set `readAt` only if currently null (`COALESCE`), pinned to the
 * caller. RETURNS the row (so a second call still returns it, unchanged) or `undefined` when no row of the
 * caller's matches the id (→ the verb throws not-found; a user can't probe another's inbox).
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
    .where(
      and(eq(notifications.id, notificationId), eq(notifications.recipientUserId, recipientUserId)),
    )
    .returning(ROW_COLS);
  return updated[0];
}

/**
 * Bulk recipient-scoped read-flip: set `readAt` on every one of the caller's unread rows in ONE UPDATE
 * (the bell's "open = mark everything read" gesture — no per-row loop). Same `COALESCE` idempotence as
 * {@link markReadScoped} (an already-read row is left with its original instant); dismissed rows are
 * included (dismissing doesn't imply read, and a re-open of a dismissed-then-undismissed row should still
 * read as read). Returns the number of rows the UPDATE actually touched (rows that were unread).
 */
export async function markAllReadScoped(
  db: Db,
  recipientUserId: NotificationEvent["recipientUserId"],
  now: number,
): Promise<number> {
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
    .where(
      and(eq(notifications.id, notificationId), eq(notifications.recipientUserId, recipientUserId)),
    )
    .returning(ROW_COLS);
  return updated[0];
}
