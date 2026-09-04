// domain/chat/persistence/chat-metadata-write — the ONE way `chats.metadata` is written.
//
// WHY IT EXISTS (#1450). Every knob on a room lives in one JSON column: the rpg pointer, the group config, the
// room overrides, the databank visibility, the background, the reaction and offer-choices postures. Each writer
// used to READ the whole row, merge its own sub-blob in memory, and write the WHOLE column back with a WHERE
// that constrained the chat id and background availability — never a prior-metadata value. That is textbook
// lost-update on a live room: an rpg pointer write and any host knob write racing each other silently discarded
// one another, and a pointer DETACH could resurrect a sibling sub-blob that had been changed in between.
//
// THE FIX IS THE JSON PATH, NOT A VERSION COLUMN. SQLite evaluates `json_set`/`json_remove` against the row as
// it exists AT WRITE TIME, so two writers touching DIFFERENT keys both survive with no optimistic-version
// retry loop, no new column, and no schema change — and a writer touching the SAME key is a genuine
// last-writer-wins on that one knob, which is what a toggle means. The read-modify-write disappears: nothing
// between the caller's read and the write can be clobbered, because the caller's copy of the siblings never
// reaches SQL.
//
// The caller still supplies its own availability GUARD (`background-write.ts` — carried vs owned), because the
// question "may this asset reference stand" is the verb's authority decision, not this seam's.

import type { ChatMetadata } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { AwaitableBatchStmt } from "@orb/db/kit";
import type { ChatId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, sql } from "drizzle-orm";

/** The `$."key"` JSON path for one metadata key. Quoted so the path is well-formed for any key spelling the
 *  contract adds later (an unquoted `$.a-b` is not a valid SQLite json path). */
function metadataPath(key: keyof ChatMetadata): string {
  return `$."${key}"`;
}

/** The chat row this write targets, guarded by the caller's availability predicate. */
function targetChat(chatId: ChatId, guard: SQL): SQL {
  return and(eq(chats.id, chatId), guard) as SQL;
}

/**
 * Write ONE metadata key, leaving every sibling key exactly as the row currently holds it. `coalesce` covers a
 * chat whose metadata column is still NULL (`json_set(NULL, …)` is NULL, which would erase the column).
 * RETURNING is the caller's "did the guard hold" signal — an empty result means the chat is gone or its
 * background asset is not available, exactly as before.
 */
export function chatMetadataSetStatement<K extends keyof ChatMetadata>(
  db: Db,
  args: {
    readonly chatId: ChatId;
    readonly key: K;
    readonly value: NonNullable<ChatMetadata[K]>;
    /** `carriedBackgroundAvailable` / `ownedBackgroundAvailable` — the verb's own authority predicate. */
    readonly guard: SQL;
    readonly now: number;
  },
): AwaitableBatchStmt<{ readonly id: ChatId }[]> {
  const payload = JSON.stringify(args.value);
  return db
    .update(chats)
    .set({
      metadata: sql`json_set(coalesce(${chats.metadata}, '{}'), ${metadataPath(args.key)}, json(${payload}))`,
      updatedAt: args.now,
    })
    .where(targetChat(args.chatId, args.guard))
    .returning({ id: chats.id });
}

/**
 * DROP one metadata key — the detach shape. `json_remove` leaves a chat that never carried the key
 * byte-identical to one that just lost it, which is what the rpg takeover gate reads (presence, never
 * `rpg === null`). Siblings are untouched for the same reason the set arm's are.
 */
export function chatMetadataDropStatement(
  db: Db,
  args: {
    readonly chatId: ChatId;
    readonly key: keyof ChatMetadata;
    readonly guard: SQL;
    readonly now: number;
  },
): AwaitableBatchStmt<{ readonly id: ChatId }[]> {
  return db
    .update(chats)
    .set({
      metadata: sql`json_remove(coalesce(${chats.metadata}, '{}'), ${metadataPath(args.key)})`,
      updatedAt: args.now,
    })
    .where(targetChat(args.chatId, args.guard))
    .returning({ id: chats.id });
}
