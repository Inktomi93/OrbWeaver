// Integration: chat's imported-token catch-up rails. The reader is imported-chat + present-host scoped and
// keyset ordered; the writer is a NULL-only/provenance compare-and-set so a later measured value wins.

import type { Db } from "@orb/db";
import { chats, messageVariants, statsCanonVersions } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  createCompareAndSetImportedTokenUsage,
  createListImportedTokenUsageCandidates,
} from "../../../../../packages/server/src/domain/chat/persistence/token-usage-backfill.ts";
import { bumpStatsCanonVersion } from "../../../../../packages/server/src/domain/stats/write/apply-delta.ts";
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

  // A plain role='host' join emits one candidate row PER matching host seat, which silently doubles every
  // census number the workload reports (`scanned`, `ownersScanned`, `compareAndSetSkipped`) and leaves the
  // loser host unreconciled (#382). TWO mechanisms keep it at one, and this test pins both halves:
  //   · the PRESENT-host half is now PHYSICS — `chat_participants_chat_host_unique`, a partial UNIQUE over
  //     (chatId) WHERE role='host' AND left_seq IS NULL (#390). The two-present-host roster this test used
  //     to seed is no longer constructible, so the arm asserts the REFUSAL instead of the reader's tiebreak.
  //   · the DEPARTED-host half is still the READER's — a host who left KEEPS role='host' and is deliberately
  //     outside the partial index, so the resolver's own `leftSeq IS NULL` + limit-1 is what stops every
  //     prior host of the room from re-entering the join. That arm is unchanged and still the live defect pin.
  test("a room's prior hosts stay OUT of the census: one candidate per variant, owned by the present seat", async () => {
    const current = await seedUser(db, castId<Handle>("current_host"));
    const second = await seedUser(db, castId<Handle>("second_host"));
    const chatId = await seedChat(db, "two_hosts");
    await db.update(chats).set({ importedFrom: "two-hosts.jsonl" }).where(eq(chats.id, chatId));
    // Two hosts who LEFT keep role='host' (deliberately outside the partial index) and joined EARLIEST, so
    // the resolver's `ORDER BY joinSeq` would hand the census to a departed owner if its `leftSeq IS NULL`
    // filter were dropped — that ordering is what makes this arm a live pin rather than a tautology.
    const founder = await seedUser(db, castId<Handle>("founder"));
    const successor = await seedUser(db, castId<Handle>("successor_host"));
    await seedParticipant(db, { chatId, key: "founder_host", userId: founder, role: "host", joinSeq: 0, leftSeq: 2 });
    await seedParticipant(db, { chatId, key: "successor_host", userId: successor, role: "host", joinSeq: 1, leftSeq: 3 });
    await seedParticipant(db, { chatId, key: "current_host", userId: current, role: "host", joinSeq: 4 });
    // A SECOND present host is refused by the index — the double-count state is unreachable, not merely handled.
    const collision = await seedParticipant(db, { chatId, key: "second_host", userId: second, role: "host", joinSeq: 5 }).catch((err: unknown) => err);
    expect(isConstraintViolation(collision)?.kind).toBe("unique");
    const only = await seedMessage(db, chatId, 1, { role: "assistant", content: "one row, one owner" });

    const candidates = await createListImportedTokenUsageCandidates(db)({ hostUserId: null, afterVariantId: null, limit: 10 });

    expect(candidates.map((row) => ({ variantId: row.variantId, ownerId: row.ownerId }))).toEqual([{ variantId: only.variantId, ownerId: current }]);
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
    const compareAndSet = createCompareAndSetImportedTokenUsage(db, bumpStatsCanonVersion);

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
    expect((await db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, owner)))[0]?.version).toBeGreaterThanOrEqual(2);
  });
});
