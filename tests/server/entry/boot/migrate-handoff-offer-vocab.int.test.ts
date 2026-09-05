// entry/boot/migrate-handoff-offer-vocab — the #1649 host-handoff offer DATA migration, against a real
// libSQL db (the .int lane). The owner ruled arm (a) — rename the persisted `copyCast` wire key to
// `copyCharacters` WITH a migration and NO read-compat shim — so the whole safety of the rename rests on
// this step running before anything reads a chat.
//
// THE DEFECT IT EXISTS FOR is silent, which is why the first pin asserts it directly: the offer's read seam
// is `handoffOfferSchema.catch(NO_HANDOFF_OFFER).parse(...)`, so an un-migrated blob does not throw — it
// degrades to the no-offer offer and the departing host's recorded consent to hand over their characters
// evaporates at accept. Asserting through `loadPendingHandoff` (the seam the accept actually reads) rather
// than through the column text is what makes that a behavioural pin instead of a spelling check.
//
// Also pinned: idempotence (the second boot rewrites nothing), value-preservation of the untouched
// `copyGmPreset` half, `false` surviving as `false` rather than collapsing into the no-offer default, and
// fail-open on a blob that is not JSON at all (a corrupt row must not abort boot).

import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { migrateHandoffOfferVocabOnBoot } from "@orb/server/entry/boot";
import { eq, sql } from "drizzle-orm";
import { loadPendingHandoff } from "../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_handoffvocab1");

/** Seed a chat whose offer blob is written in the PRE-#1649 spelling. The column is written as raw text on
 *  purpose — the typed drizzle `$type<HandoffOffer>` can no longer express the old key, which is exactly the
 *  situation an installed db is in. */
async function seedOldSpellingOffer(db: Db, raw: string, chatId: ChatId = CHAT_ID): Promise<void> {
  await db.insert(chats).values([{ id: chatId }]);
  await db
    .update(chats)
    .set({ pendingHandoffOffer: sql`${raw}` })
    .where(eq(chats.id, chatId));
}

async function storedOffer(db: Db, chatId: ChatId = CHAT_ID): Promise<string | null> {
  const rows = await db
    .select({ blob: sql<string | null>`cast(${chats.pendingHandoffOffer} as text)` })
    .from(chats)
    .where(eq(chats.id, chatId));
  return rows.at(0)?.blob ?? null;
}

test("a pre-#1649 offer keeps its CONSENT across the rename — the read seam sees copyCharacters:true", async () => {
  const db = await freshDb();
  await seedOldSpellingOffer(db, '{"copyCast":true,"copyGmPreset":true}');

  // RED WITHOUT THE MIGRATION: the un-migrated blob fails `handoffOfferSchema` and `.catch` hands back
  // NO_HANDOFF_OFFER, so the accept copies nothing and nobody is told.
  const before = await loadPendingHandoff(db, CHAT_ID);
  expect(before.offer).toStrictEqual({ copyCharacters: false, copyGmPreset: false });

  const rewritten = await migrateHandoffOfferVocabOnBoot({ db });

  expect(rewritten).toBe(1);
  expect((await loadPendingHandoff(db, CHAT_ID)).offer).toStrictEqual({ copyCharacters: true, copyGmPreset: true });
});

test("the untouched half survives verbatim — a false copyGmPreset is not widened by the rewrite", async () => {
  const db = await freshDb();
  await seedOldSpellingOffer(db, '{"copyCast":true,"copyGmPreset":false}');

  await migrateHandoffOfferVocabOnBoot({ db });

  expect((await loadPendingHandoff(db, CHAT_ID)).offer).toStrictEqual({ copyCharacters: true, copyGmPreset: false });
});

// The JSON booleans have to survive as JSON booleans: `json_extract` of a JSON `true` yields the INTEGER 1,
// which `z.boolean()` rejects — a rewrite that forgot to re-mint them through `json(...)` would land a blob
// that parses to the no-offer default and would pass a column-text spelling check while failing here.
test("a declined offer stays DECLINED — false is carried, not collapsed into the no-offer default", async () => {
  const db = await freshDb();
  await seedOldSpellingOffer(db, '{"copyCast":false,"copyGmPreset":true}');

  await migrateHandoffOfferVocabOnBoot({ db });

  expect((await loadPendingHandoff(db, CHAT_ID)).offer).toStrictEqual({ copyCharacters: false, copyGmPreset: true });
  expect(await storedOffer(db)).toContain('"copyCharacters":false');
});

test("IDEMPOTENT — the second boot rewrites nothing and leaves the blob byte-identical", async () => {
  const db = await freshDb();
  await seedOldSpellingOffer(db, '{"copyCast":true,"copyGmPreset":false}');

  expect(await migrateHandoffOfferVocabOnBoot({ db })).toBe(1);
  const afterFirst = await storedOffer(db);

  expect(await migrateHandoffOfferVocabOnBoot({ db })).toBe(0);
  expect(await storedOffer(db)).toBe(afterFirst);
});

test("an offer ALREADY in the new spelling is not touched (the boot after the migration landed)", async () => {
  const db = await freshDb();
  await db.insert(chats).values([{ id: CHAT_ID, pendingHandoffOffer: { copyCharacters: true, copyGmPreset: false } }]);
  const before = await storedOffer(db);

  expect(await migrateHandoffOfferVocabOnBoot({ db })).toBe(0);
  expect(await storedOffer(db)).toBe(before);
});

test("a null column and a NON-JSON blob are both left alone — a corrupt row must not abort boot", async () => {
  const db = await freshDb();
  const nullRow = castId<ChatId>("chat_handoffvocab2");
  await db.insert(chats).values([{ id: nullRow }]);
  await seedOldSpellingOffer(db, "not json at all");

  expect(await migrateHandoffOfferVocabOnBoot({ db })).toBe(0);
  expect(await storedOffer(db, nullRow)).toBeNull();
  expect(await storedOffer(db)).toBe("not json at all");
});
