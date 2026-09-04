// schema/notifications — the per-user DURABLE inbox (NEW domain, D16; producer = `domain/notifications`).
// It exists for ONE reason: the per-chat bus cannot reach a NON-member, so invite /
// kick / host-handoff delivery needs a per-user channel that survives the recipient being offline. The
// TABLE is the source of truth — DURABLE-FIRST: the row is INSERTed inside the producer's
// membership-transition tx, and the per-user bus fan-out is the after-commit hook (so `list` returns the
// event from the table alone even if the emit path is killed).
//
// `type` + `payload` store the CLOSED `NotificationEvent` discriminated union (`@orb/contracts/notifications`):
//   • `type`    — the discriminant column (denormalized `payload.type`), so the inbox can filter/index by
//                 reason without parsing JSON. It IMPORTS the union's member set: `NOTIFICATION_TYPES`
//                 comes from `@orb/contracts/notifications`, where a mapped-Record `satisfies` makes the
//                 tuple provably the WHOLE union at compile time in both directions. It used to be a local
//                 respelling checked by a test that read zod's internal option shape (#1379 item 3) —
//                 one home, and `tsc` instead of an assertion. Column enum + a tuple-derived CHECK.
//   • `payload` — the full `NotificationEvent` JSON, branded `$type<NotificationEvent>()`. The union is the
//                 phishing/exfil belt: it is built from `z.object` members that STRIP unknown keys (no
//                 `.loose()`/`.catchall()`/`z.unknown()`), so credentials / baseUrls are TYPE-LEVEL
//                 UNREPRESENTABLE and STRIPPED at the read seam (a test
//                 proves a secret-shaped payload does not survive a parse).
//
// `seq` is a MONOTONIC per-recipient integer (the stream's stable cursor / `lastEventId` resume key) —
// `unique(recipientUserId, seq)` enforces no duplicate cursor per inbox. `readAt`/`dismissedAt` are
// nullable timestamps (null = unread / not dismissed). `recipientUserId` FK users CASCADE.

import type { NotificationEvent } from "@orb/contracts/notifications";
import { NOTIFICATION_TYPES } from "@orb/contracts/notifications";
import type { NotificationId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { users } from "./users.ts";

// CHECK list derived from the CONTRACT'S OWN tuple (`@orb/contracts/notifications` NOTIFICATION_TYPES),
// never re-spelled here: `type in ('invite', …)`. Raw fragment — a CHECK is static DDL and cannot carry
// bound parameters (users.ts pattern).
//
// #1379 item 3: this file used to hand-spell the member list, because the contract exported only the
// derived TYPE and a DDL fragment needs VALUES. The db test then proved the two agreed by reaching into
// zod's internal option shape. The tuple now lives at its one home, where a mapped-Record `satisfies`
// makes completeness a `tsc` obligation rather than an assertion — so the respelling and the
// introspection are both gone.
const TYPE_CHECK_LIST = checkList(NOTIFICATION_TYPES);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").$type<NotificationId>().primaryKey(),
    // The single recipient — the inbox is scoped by this FK; CASCADE so a deleted user's inbox goes too.
    recipientUserId: text("recipient_user_id")
      .$type<NotificationEvent["recipientUserId"]>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The discriminant (denormalized `payload.type`) — enum derives the union member set (see header).
    type: text("type", { enum: NOTIFICATION_TYPES }).notNull(),
    // The full closed event; secret-free by construction (the union strips unknown keys at the read seam).
    payload: text("payload", { mode: "json" }).$type<NotificationEvent>().notNull(),
    // Monotonic per-recipient ordering — the resumable stream's stable cursor (`lastEventId`).
    seq: integer("seq").notNull(),
    // null = unread; set when the recipient reads it. nullable timestamp (no default).
    readAt: integer("read_at"),
    // null = not dismissed; set when the recipient dismisses it. nullable timestamp (no default).
    dismissedAt: integer("dismissed_at"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // Per-recipient monotonic uniqueness — the cursor key + the inbox-ordering index in one.
    uniqueIndex("notifications_recipient_seq_unique").on(t.recipientUserId, t.seq),
    check("notifications_type_check", sql.raw(`type in (${TYPE_CHECK_LIST})`)),
  ],
);
