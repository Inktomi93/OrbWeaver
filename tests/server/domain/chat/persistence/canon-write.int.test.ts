// persistence/canon-write — the D26 PRODUCTION writer (.int: real libSQL FK enforcement). Pins the 3-step
// circular-FK dance (slot→variant→pointer), the slot⋈selected-variant read-back, append-a-variant (regen),
// select-active (the pointer flip), and that `buildCommittedMessageView` equals the re-read row byte-for-byte.

import type { UserMacroDraws } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import {
  appendVariantStatements,
  buildCommittedMessageView,
  insertCanonMessageStatements,
  selectActiveVariantStatement,
} from "../../../../../packages/server/src/domain/chat/persistence/canon-write";
import { loadCanonHistory, loadSlotTarget } from "../../../../../packages/server/src/domain/chat/persistence/queries";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, seedCharacter, seedChat, seedUser } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

function ids(key: string): { messageId: MessageId; variantId: MessageVariantId } {
  return {
    messageId: castId<MessageId>(`message_${key}`),
    variantId: castId<MessageVariantId>(`variant_${key}_0`),
  };
}

describe("persistence/canon-write — the D26 3-step dance", () => {
  test("insert commits the slot + first variant; the read joins them (FK integrity)", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = ids("m1");
    const params = {
      messageId,
      variantId,
      chatId,
      seq: 1,
      role: "assistant" as const,
      now: FROZEN_AT,
      variant: {
        content: "hello world",
        model: "opus",
        provider: "anthropic",
        tokensIn: 12,
        tokensOut: 7,
      },
    };

    await db.batch(batchMany(insertCanonMessageStatements(db, params)));

    const history = await loadCanonHistory(db, chatId);
    expect(history).toHaveLength(1);
    const row = history[0];
    // The innerJoin on selectedVariantId returning the row PROVES the pointer was set to a real variant.
    expect(row?.selectedVariantId).toBe(variantId);
    expect(row?.content).toBe("hello world");
    expect(row?.role).toBe("assistant");
    expect(row?.selectedVariantIdx).toBe(0);
    expect(row?.variantCount).toBe(1);
    expect(row?.model).toBe("opus");
    expect(row?.tokensIn).toBe(12);
    expect(row?.tokensOut).toBe(7);
  });

  test("buildCommittedMessageView equals the re-read row (no round-trip needed)", async () => {
    const chatId = await seedChat(db, "a");
    const characterId = await seedCharacter(db, await seedUser(db, "owner"), "aria");
    const { messageId, variantId } = ids("m1");
    const params = {
      messageId,
      variantId,
      chatId,
      seq: 1,
      role: "assistant" as const,
      characterId: characterId as CharacterId,
      now: FROZEN_AT,
      variant: { content: "voiced", costUsd: 0.002, finishReason: "stop" },
    };

    await db.batch(batchMany(insertCanonMessageStatements(db, params)));

    const [reread] = await loadCanonHistory(db, chatId);
    expect(buildCommittedMessageView(params)).toEqual(reread);
  });

  test("append-variant (regen) adds a swipe + flips the selected pointer", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = ids("m1");
    await db.batch(
      batchMany(
        insertCanonMessageStatements(db, {
          messageId,
          variantId,
          chatId,
          seq: 1,
          role: "assistant",
          now: FROZEN_AT,
          variant: { content: "first" },
        }),
      ),
    );

    const v2 = castId<MessageVariantId>("variant_m1_1");
    await db.batch(
      batchMany(
        appendVariantStatements(db, {
          messageId,
          variantId: v2,
          idx: 1,
          now: FROZEN_AT,
          variant: { content: "rerolled" },
        }),
      ),
    );

    const [row] = await loadCanonHistory(db, chatId);
    expect(row?.variantCount).toBe(2);
    expect(row?.selectedVariantId).toBe(v2);
    expect(row?.selectedVariantIdx).toBe(1);
    expect(row?.content).toBe("rerolled");
  });

  test("select-active flips the pointer back to a sibling variant (zero copy)", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = ids("m1");
    await db.batch(
      batchMany(
        insertCanonMessageStatements(db, {
          messageId,
          variantId,
          chatId,
          seq: 1,
          role: "assistant",
          now: FROZEN_AT,
          variant: { content: "first" },
        }),
      ),
    );
    const v2 = castId<MessageVariantId>("variant_m1_1");
    await db.batch(
      batchMany(
        appendVariantStatements(db, {
          messageId,
          variantId: v2,
          idx: 1,
          now: FROZEN_AT,
          variant: { content: "rerolled" },
        }),
      ),
    );

    // Flip back to the original variant — a pointer move, no content copy.
    await db.batch(batchMany([selectActiveVariantStatement(db, messageId, variantId)]));

    const [row] = await loadCanonHistory(db, chatId);
    expect(row?.selectedVariantId).toBe(variantId);
    expect(row?.selectedVariantIdx).toBe(0);
    expect(row?.content).toBe("first");
    expect(row?.variantCount).toBe(2);
  });

  test("F10: a committed variant row stamps maxOutputTokens + reasoningEffort (D26 provenance, not NULL)", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = ids("m1");
    await db.batch(
      batchMany(
        insertCanonMessageStatements(db, {
          messageId,
          variantId,
          chatId,
          seq: 1,
          role: "assistant",
          now: FROZEN_AT,
          variant: { content: "capped", maxOutputTokens: 4096, reasoningEffort: "high" },
        }),
      ),
    );

    const [row] = await db
      .select({
        maxOutputTokens: messageVariants.maxOutputTokens,
        reasoningEffort: messageVariants.reasoningEffort,
      })
      .from(messageVariants)
      .where(eq(messageVariants.id, variantId));
    expect(row?.maxOutputTokens).toBe(4096);
    expect(row?.reasoningEffort).toBe("high");
  });

  test("WAVE MU: macroDraws round-trips on insert + append, read back via loadSlotTarget (write↔read seam)", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = ids("m1");
    const firstDraws: UserMacroDraws = { mood: { tone: "grim" } };
    await db.batch(
      batchMany(
        insertCanonMessageStatements(db, {
          messageId,
          variantId,
          chatId,
          seq: 1,
          role: "assistant",
          now: FROZEN_AT,
          variant: { content: "first", macroDraws: firstDraws },
        }),
      ),
    );

    // The write end round-trips through the read-back channel both swipe + continue use.
    const target0 = await loadSlotTarget(db, chatId, messageId);
    expect(target0?.macroDraws).toEqual(firstDraws);

    // A swipe re-persists the (replayed) record onto the new selected variant.
    const v2 = castId<MessageVariantId>("variant_m1_1");
    await db.batch(
      batchMany(
        appendVariantStatements(db, {
          messageId,
          variantId: v2,
          idx: 1,
          now: FROZEN_AT,
          variant: { content: "rerolled", macroDraws: firstDraws },
        }),
      ),
    );
    const target1 = await loadSlotTarget(db, chatId, messageId);
    expect(target1?.selectedVariantId).toBe(v2);
    expect(target1?.macroDraws).toEqual(firstDraws);
  });

  test("WAVE MU: a null/absent macroDraws (pre-feature variant) reads back as null, never throws", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = ids("m1");
    await db.batch(
      batchMany(
        insertCanonMessageStatements(db, {
          messageId,
          variantId,
          chatId,
          seq: 1,
          role: "assistant",
          now: FROZEN_AT,
          variant: { content: "no draws" },
        }),
      ),
    );
    const target = await loadSlotTarget(db, chatId, messageId);
    expect(target?.macroDraws).toBeNull();

    // A malformed blob written directly (a corrupt row) degrades to null (safeParse), never a throw — a
    // non-record string is the corrupt-row shape the read-seam safeParse-degrade exists to survive; no
    // factory can produce an intentionally malformed `UserMacroDraws`.
    const corruptDraws = "not-a-record" as unknown as UserMacroDraws; // FABRICATION-OK: deliberate invalid-input probe
    await db.update(messageVariants).set({ macroDraws: corruptDraws }).where(eq(messageVariants.id, variantId));
    const degraded = await loadSlotTarget(db, chatId, messageId);
    expect(degraded?.macroDraws).toBeNull();
  });

  test("append-variant with selectActive:false leaves the original selected", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = ids("m1");
    await db.batch(
      batchMany(
        insertCanonMessageStatements(db, {
          messageId,
          variantId,
          chatId,
          seq: 1,
          role: "assistant",
          now: FROZEN_AT,
          variant: { content: "first" },
        }),
      ),
    );
    await db.batch(
      batchMany(
        appendVariantStatements(db, {
          messageId,
          variantId: castId<MessageVariantId>("variant_m1_1"),
          idx: 1,
          now: FROZEN_AT,
          variant: { content: "background" },
          selectActive: false,
        }),
      ),
    );

    const [row] = await loadCanonHistory(db, chatId);
    expect(row?.variantCount).toBe(2);
    expect(row?.selectedVariantId).toBe(variantId);
    expect(row?.content).toBe("first");
  });
});
