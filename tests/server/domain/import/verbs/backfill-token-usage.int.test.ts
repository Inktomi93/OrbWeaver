// Integration: import's catch-up loop over chat's real persistence rails. Proves first-pass settlement,
// second-pass idempotency, exact-vs-estimated provenance, and owner reconciliation only after real writes.

import type { Db } from "@orb/db";
import { chats, messageVariants } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { eq } from "drizzle-orm";
import { beforeEach, describe, vi } from "vitest";
import {
  createCompareAndSetImportedTokenUsage,
  createListImportedTokenUsageCandidates,
} from "../../../../../packages/server/src/domain/chat/persistence/token-usage-backfill.ts";
import { createBackfillTokenUsage } from "../../../../../packages/server/src/domain/import/verbs/backfill-token-usage.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedMessage, seedParticipant, seedUser } from "../../chat/_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("createBackfillTokenUsage", () => {
  test("settles exact, estimated, and legacy rows once; the second pass is a read-only census", async () => {
    const ownerId = await seedUser(db, castId<Handle>("backfill_owner"));
    const chatId = await seedChat(db, "backfill");
    await db.update(chats).set({ importedFrom: "long-corpus-chat.jsonl" }).where(eq(chats.id, chatId));
    await seedParticipant(db, { chatId, key: "backfill_host", userId: ownerId, role: "host" });
    const exact = await seedMessage(db, chatId, 1, { role: "assistant", content: "exact source count" });
    const estimated = await seedMessage(db, chatId, 2, { role: "user", content: "raw imported user text" });
    const legacy = await seedMessage(db, chatId, 3, { role: "assistant", content: "legacy" });
    const measured = await seedMessage(db, chatId, 4, { role: "assistant", content: "live" });
    await db
      .update(messageVariants)
      .set({ metadata: { ["token_count"]: 0 } })
      .where(eq(messageVariants.id, exact.variantId));
    await db.update(messageVariants).set({ tokensOut: 17 }).where(eq(messageVariants.id, legacy.variantId));
    await db.update(messageVariants).set({ tokensIn: 9, tokensOut: 11, tokenProvenance: "measured" }).where(eq(messageVariants.id, measured.variantId));
    const reconcileImportStats = vi.fn(async () => undefined);
    const deps = {
      listTokenUsageCandidates: createListImportedTokenUsageCandidates(db),
      compareAndSetTokenUsage: createCompareAndSetImportedTokenUsage(db),
      reconcileImportStats,
    };
    const backfillTokenUsage = createBackfillTokenUsage(deps);

    const first = await backfillTokenUsage({
      ownerId,
      dryRun: false,
      report: vi.fn(),
      signal: new AbortController().signal,
    });

    expect(first).toEqual({
      scanned: 4,
      exactRecovered: 1,
      legacyPromoted: 1,
      estimated: 1,
      alreadyMeasured: 1,
      alreadyEstimated: 0,
      compareAndSetSkipped: 0,
      ownersScanned: 1,
      ownersReconciled: 1,
      dryRun: false,
    });
    expect(reconcileImportStats).toHaveBeenCalledExactlyOnceWith({ ownerId });
    expect((await db.select().from(messageVariants).where(eq(messageVariants.id, exact.variantId)))[0]).toMatchObject({
      tokensIn: null,
      tokensOut: 0,
      tokenProvenance: "measured",
    });
    expect((await db.select().from(messageVariants).where(eq(messageVariants.id, estimated.variantId)))[0]).toMatchObject({
      tokensIn: estimateTokens("raw imported user text"),
      tokensOut: null,
      tokenProvenance: "estimated",
    });
    expect((await db.select().from(messageVariants).where(eq(messageVariants.id, legacy.variantId)))[0]).toMatchObject({
      tokensIn: null,
      tokensOut: 17,
      tokenProvenance: "measured",
    });

    reconcileImportStats.mockClear();
    const second = await backfillTokenUsage({
      ownerId,
      dryRun: false,
      report: vi.fn(),
      signal: new AbortController().signal,
    });
    expect(second).toMatchObject({
      scanned: 4,
      exactRecovered: 0,
      legacyPromoted: 0,
      estimated: 0,
      alreadyMeasured: 3,
      alreadyEstimated: 1,
      compareAndSetSkipped: 0,
      ownersReconciled: 0,
    });
    expect(reconcileImportStats).not.toHaveBeenCalled();
  });
});
