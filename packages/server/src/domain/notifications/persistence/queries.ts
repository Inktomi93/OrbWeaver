// domain/notifications/persistence/queries — ALL `notifications`-table access (queries only; the verbs hold
// the business logic). Three properties are PHYSICS here:
//   • DURABLE-FIRST seq — the INSERT computes `seq` in ONE statement via a `MAX(seq)+1` scalar subquery
//     scoped to the recipient (SQLite evaluates it against the pre-insert table state). The monotonic
//     cursor is db-driven, never minted in JS (determinism); `unique(recipientUserId, seq)` is the backstop.
//   • RECIPIENT-SCOPE — every read/update WHERE-clause pins `recipientUserId`, so a row that isn't the
//     caller's matches NOTHING (the verb maps the empty match → not-found). A user cannot read/touch
//     another's inbox (notifications.md invariant #3). This file NEVER imports/joins `users`
//     (no-direct-users-read): the recipient id arrives as a param from the resolved Principal / the event.
//   • IDEMPOTENT state flips — markRead/dismiss set the timestamp via `COALESCE(col, :now)`, so a re-flip
//     keeps the original instant (notifications.md: markRead/dismiss idempotence).
//
// The row shape is the file-local `NotificationRow` (NOT exported — no feature type leaks from persistence,
// no-inline-types); the verbs project it to the `InboxView` contract shape.

import type { NotificationEvent, NotificationType } from "@orb/contracts/notifications";
import type { Db } from "@orb/db";
import { notifications } from "@orb/db";
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

/**
 * Durable-first INSERT: persist the closed event for its recipient with a db-driven monotonic `seq`
 * (`MAX(seq)+1` scoped to the recipient, atomic in the one statement). RETURNS the stored row.
 */
export async function insertNotification(
  db: Db,
  row: NotificationInsert,
): Promise<NotificationRow> {
  const inserted = await db
    .insert(notifications)
    .values({
      id: row.id,
      recipientUserId: row.recipientUserId,
      type: row.type,
      payload: row.payload,
      createdAt: row.createdAt,
      // Per-recipient monotonic cursor — evaluated against the pre-insert table state (db-driven; no JS clock).
      seq: sql<number>`(select coalesce(max(${notifications.seq}), 0) + 1 from ${notifications} where ${notifications.recipientUserId} = ${row.recipientUserId})`,
    })
    .returning(ROW_COLS);
  // The INSERT always yields exactly one row.
  return inserted[0] as NotificationRow;
}

/**
 * The caller's active inbox page — recipient-scoped, dismissed excluded, newest-first by `seq`, paged with
 * `seq < cursor` when a cursor is given. Fetches `limit` rows. Recipient-scope is in the WHERE clause.
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
