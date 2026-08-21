// Integration: chat's imported-token catch-up rails. The reader is imported-chat + present-host scoped and
// keyset ordered; the writer is a NULL-only/provenance compare-and-set so a later measured value wins.

import type { Db } from "@orb/db";
import { chats, messageVariants } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  createCompareAndSetImportedTokenUsage,
  createListImportedTokenUsageCandidates,
} from "../../../../../packages/server/src/domain/chat/persistence/token-usage-backfill.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("imported token-usage persistence", () => {
  test("the reader is imported-source and present-host scoped, with stable keyset pagination", async () => {
    const owner = await seedUser(db, castId<Handle>("owner"));
    const other = await seedUser(db, castId<Handle>("other"));
    const imported = await seedChat(db, "imported");
    const foreign = await seedChat(db, "foreign");
    const native = await seedChat(db, "native");
    await db.update(chats).set({ importedFrom: "owner.jsonl" }).where(eq(chats.id, imported));
    await db.update(chats).set({ importedFrom: "other.jsonl" }).where(eq(chats.id, foreign));
    await seedParticipant(db, { chatId: imported, key: "owner_host", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: foreign, key: "other_host", userId: other, role: "host" });
    await seedParticipant(db, { chatId: native, key: "native_host", userId: owner, role: "host" });
    const first = await seedMessage(db, imported, 1, { role: "assistant", content: "first" });
    const second = await seedMessage(db, imported, 2, { role: "user", content: "second" });
    await seedMessage(db, foreign, 1, { content: "foreign" });
    await seedMessage(db, native, 1, { content: "native" });
    const list = createListImportedTokenUsageCandidates(db);

    const page1 = await list({ hostUserId: owner, afterVariantId: null, limit: 1 });
    const page2 = await list({ hostUserId: owner, afterVariantId: page1[0]?.variantId ?? null, limit: 10 });

    expect(page1.map((row) => row.variantId)).toEqual([first.variantId]);
    expect(page2.map((row) => row.variantId)).toEqual([second.variantId]);
    expect((await list({ hostUserId: null, afterVariantId: null, limit: 10 })).map((row) => row.ownerId)).toEqual([other, owner, owner]);
  });

  test("the CAS fills only a matching unrecorded row, promotes legacy numbers without rewriting them, and loses to measured usage", async () => {
    const owner = await seedUser(db, castId<Handle>("cas_owner"));
    const chatId = await seedChat(db, "cas");
    await db.update(chats).set({ importedFrom: "cas.jsonl" }).where(eq(chats.id, chatId));
    await seedParticipant(db, { chatId, key: "cas_host", userId: owner, role: "host" });
    const exact = await seedMessage(db, chatId, 1, { content: "exact" });
    const legacy = await seedMessage(db, chatId, 2, { content: "legacy" });
    const raced = await seedMessage(db, chatId, 3, { content: "raced" });
    const contentRaced = await seedMessage(db, chatId, 4, { content: "old content" });
    const metadataRaced = await seedMessage(db, chatId, 5, { content: "metadata raced" });
    await db
      .update(messageVariants)
      .set({ metadata: { ["token_count"]: 4 } })
      .where(eq(messageVariants.id, exact.variantId));
    await db.update(messageVariants).set({ tokensOut: 17 }).where(eq(messageVariants.id, legacy.variantId));
    const list = createListImportedTokenUsageCandidates(db);
    const candidates = await list({ hostUserId: owner, afterVariantId: null, limit: 10 });
    const byId = new Map(candidates.map((candidate) => [candidate.variantId, candidate]));
    const exactCandidate = byId.get(exact.variantId);
    const legacyCandidate = byId.get(legacy.variantId);
    const racedCandidate = byId.get(raced.variantId);
    const contentRacedCandidate = byId.get(contentRaced.variantId);
    const metadataRacedCandidate = byId.get(metadataRaced.variantId);
    if (
      exactCandidate === undefined ||
      legacyCandidate === undefined ||
      racedCandidate === undefined ||
      contentRacedCandidate === undefined ||
      metadataRacedCandidate === undefined
    ) {
      throw new Error("seeded candidate missing");
    }
    const compareAndSet = createCompareAndSetImportedTokenUsage(db);

    expect(await compareAndSet({ candidate: exactCandidate, resolution: { tokensIn: null, tokensOut: 4, tokenProvenance: "measured" } })).toBe(true);
    expect(await compareAndSet({ candidate: exactCandidate, resolution: { tokensIn: null, tokensOut: 4, tokenProvenance: "measured" } })).toBe(false);
    expect(await compareAndSet({ candidate: legacyCandidate, resolution: { tokensIn: null, tokensOut: 999, tokenProvenance: "estimated" } })).toBe(true);

    // Simulate a live provider write after the reader snapshot but before this workload's CAS.
    await db.update(messageVariants).set({ tokensIn: 23, tokensOut: 42, tokenProvenance: "measured" }).where(eq(messageVariants.id, raced.variantId));
    expect(await compareAndSet({ candidate: racedCandidate, resolution: { tokensIn: null, tokensOut: 2, tokenProvenance: "estimated" } })).toBe(false);

    await db.update(messageVariants).set({ content: "new content" }).where(eq(messageVariants.id, contentRaced.variantId));
    expect(await compareAndSet({ candidate: contentRacedCandidate, resolution: { tokensIn: null, tokensOut: 2, tokenProvenance: "estimated" } })).toBe(false);

    await db
      .update(messageVariants)
      .set({ metadata: { ["token_count"]: 12 } })
      .where(eq(messageVariants.id, metadataRaced.variantId));
    expect(await compareAndSet({ candidate: metadataRacedCandidate, resolution: { tokensIn: null, tokensOut: 2, tokenProvenance: "estimated" } })).toBe(false);

    const rows = await db.select().from(messageVariants).where(eq(messageVariants.messageId, exact.messageId));
    expect(rows[0]).toMatchObject({ tokensIn: null, tokensOut: 4, tokenProvenance: "measured" });
    expect((await db.select().from(messageVariants).where(eq(messageVariants.messageId, legacy.messageId)))[0]).toMatchObject({
      tokensIn: null,
      tokensOut: 17,
      tokenProvenance: "measured",
    });
    expect((await db.select().from(messageVariants).where(eq(messageVariants.messageId, raced.messageId)))[0]).toMatchObject({
      tokensIn: 23,
      tokensOut: 42,
      tokenProvenance: "measured",
    });
  });
});
