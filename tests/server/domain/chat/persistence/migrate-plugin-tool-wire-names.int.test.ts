// domain/chat/persistence/migrate-plugin-tool-wire-names — the #1391 rewrite of persisted
// `ToolCallRecord.name`s inside `message_variants.tool_calls`, against a real libSQL db (the .int lane).
//
// WHAT IS PROVEN HERE, and each one is a shape the SQL could get wrong while still looking right:
//   • the rewrite carries the TOOL half verbatim and re-prefixes only the namespace;
//   • it touches only the matching ELEMENT — a sibling call in the same array, and every other FIELD of the
//     rewritten call (`arguments`, `result`, `isError`, `durationMs`), survive byte-for-byte;
//   • ARRAY ORDER survives, which is why the statement is a per-index `json_set` and not a
//     `json_group_array` rebuild — order is the transcript's rendering order;
//   • MULTIPLE matching calls in one array are ALL rewritten (the loop, not just the first);
//   • it is IDEMPOTENT — a second pass rewrites nothing;
//   • it FAILS OPEN on a non-JSON blob rather than aborting (the #1649 nested-`json_valid` lesson);
//   • and the PLANTED NEGATIVE CONTROL: with an EMPTY rename set, a row carrying a legacy name is left
//     exactly as it was — so a green "nothing was rewritten" in the other direction is not a false clean.
//
// The read-back goes through `toolCallRecordSchema`, never the stored bytes: SQLite's json functions
// re-serialize the object, so key ORDER inside a record is not preserved and a byte comparison would pin the
// wrong thing.

import { toolCallRecordSchema } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import type { Handle, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { migratePluginToolWireNames } from "@orb/server/domain/chat";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedMessage, seedUser } from "../_support.ts";

const RENAME = [{ from: "plugin_oracle_deck_", to: "plugin_oracle__deck_" }];

/** One persisted tool-call record, in the shape the turn pipeline commits. */
function record(name: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { toolCallId: `call_${name}`, name, arguments: '{"suit":"cups"}', result: "Ace of Cups", isError: false, durationMs: 12, ...over };
}

/** Seed a variant holding `calls` in its `tool_calls` column, written as RAW json text — the typed column
 *  would happily take these, but writing raw is what a pre-#1391 row actually looks like on disk. */
async function seedToolCalls(db: Db, calls: readonly Record<string, unknown>[]): Promise<MessageVariantId> {
  const userId = await seedUser(db, castId<Handle>("alice"));
  const chatId = await seedChat(db, "c1");
  const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant", authorUserId: userId });
  await db
    .update(messageVariants)
    .set({ toolCalls: sql`${JSON.stringify(calls)}` })
    .where(eq(messageVariants.id, variantId));
  return variantId;
}

async function readNames(db: Db, variantId: MessageVariantId): Promise<readonly string[]> {
  const rows = await db
    .select({ blob: sql<string | null>`cast(${messageVariants.toolCalls} as text)` })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId));
  const raw = rows.at(0)?.blob ?? "[]";
  return (JSON.parse(raw) as unknown[]).map((entry) => toolCallRecordSchema.parse(entry).name);
}

async function readRecords(db: Db, variantId: MessageVariantId): Promise<readonly ReturnType<typeof toolCallRecordSchema.parse>[]> {
  const rows = await db
    .select({ blob: sql<string | null>`cast(${messageVariants.toolCalls} as text)` })
    .from(messageVariants)
    .where(eq(messageVariants.id, variantId));
  return (JSON.parse(rows.at(0)?.blob ?? "[]") as unknown[]).map((entry) => toolCallRecordSchema.parse(entry));
}

test("a legacy name is re-prefixed and its tool half is carried across verbatim", async () => {
  const db = await freshDb();
  const variantId = await seedToolCalls(db, [record("plugin_oracle_deck_draw")]);

  expect(await migratePluginToolWireNames(db, RENAME)).toBe(1);

  expect(await readNames(db, variantId)).toEqual(["plugin_oracle__deck_draw"]);
  const [rewritten] = await readRecords(db, variantId);
  // Every other field of the record is untouched — the migration re-prefixes a name and nothing else.
  expect(rewritten).toEqual({
    toolCallId: "call_plugin_oracle_deck_draw",
    name: "plugin_oracle__deck_draw",
    arguments: '{"suit":"cups"}',
    result: "Ace of Cups",
    isError: false,
    durationMs: 12,
  });
});

test("ORDER and SIBLINGS survive: every matching call is rewritten in place, non-matching ones are not touched", async () => {
  const db = await freshDb();
  const variantId = await seedToolCalls(db, [
    record("roll_dice"),
    record("plugin_oracle_deck_draw"),
    record("plugin_mood_report"),
    record("plugin_oracle_deck_reveal"),
  ]);

  // TWO rewrites in ONE array — the per-index loop, not just the first match.
  expect(await migratePluginToolWireNames(db, RENAME)).toBe(2);

  expect(await readNames(db, variantId)).toEqual([
    "roll_dice",
    "plugin_oracle__deck_draw",
    // `mood` has no hyphen, so it is not in the rename set at all and must be untouched.
    "plugin_mood_report",
    "plugin_oracle__deck_reveal",
  ]);
});

test("it is IDEMPOTENT — the second pass matches nothing", async () => {
  const db = await freshDb();
  const variantId = await seedToolCalls(db, [record("plugin_oracle_deck_draw")]);

  expect(await migratePluginToolWireNames(db, RENAME)).toBe(1);
  expect(await migratePluginToolWireNames(db, RENAME)).toBe(0);
  expect(await readNames(db, variantId)).toEqual(["plugin_oracle__deck_draw"]);
});

test("PLANTED NEGATIVE CONTROL: an EMPTY rename set leaves a legacy name exactly as it was", async () => {
  // Without this, "0 rewritten" everywhere else could mean the statement never fires at all.
  const db = await freshDb();
  const variantId = await seedToolCalls(db, [record("plugin_oracle_deck_draw")]);

  expect(await migratePluginToolWireNames(db, [])).toBe(0);

  expect(await readNames(db, variantId)).toEqual(["plugin_oracle_deck_draw"]);
});

test("a NULL column and a non-JSON blob both fail open — one corrupt row never aborts the boot step", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, castId<Handle>("alice"));
  const chatId = await seedChat(db, "c1");
  const { variantId: nullVariant } = await seedMessage(db, chatId, 1, { role: "assistant", authorUserId: userId });
  const { variantId: garbageVariant } = await seedMessage(db, chatId, 2, { role: "assistant", authorUserId: userId });
  const { variantId: liveVariant } = await seedMessage(db, chatId, 3, { role: "assistant", authorUserId: userId });
  await db.update(messageVariants).set({ toolCalls: sql`'not json at all'` }).where(eq(messageVariants.id, garbageVariant));
  await db
    .update(messageVariants)
    .set({ toolCalls: sql`${JSON.stringify([record("plugin_oracle_deck_draw")])}` })
    .where(eq(messageVariants.id, liveVariant));

  // The garbage row is skipped, the null row is skipped, and the real row STILL gets migrated — the proof
  // that "fail open" is not "give up".
  expect(await migratePluginToolWireNames(db, RENAME)).toBe(1);

  expect(await readNames(db, liveVariant)).toEqual(["plugin_oracle__deck_draw"]);
  const rows = await db
    .select({ blob: sql<string | null>`cast(${messageVariants.toolCalls} as text)` })
    .from(messageVariants)
    .where(eq(messageVariants.id, garbageVariant));
  expect(rows.at(0)?.blob).toBe("not json at all");
  const nullRows = await db
    .select({ blob: sql<string | null>`cast(${messageVariants.toolCalls} as text)` })
    .from(messageVariants)
    .where(eq(messageVariants.id, nullVariant));
  expect(nullRows.at(0)?.blob).toBeNull();
});
