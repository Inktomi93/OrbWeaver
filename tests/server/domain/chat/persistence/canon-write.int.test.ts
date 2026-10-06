// persistence/canon-write — the D26 PRODUCTION writer (.int: real libSQL FK enforcement). Pins the 3-step
// circular-FK dance (slot→variant→pointer), the slot⋈selected-variant read-back, append-a-variant (regen),
// select-active (the pointer flip), and that `buildCommittedMessageView` equals the re-read row byte-for-byte.

import type { UserMacroDraws } from "@orb/contracts/chat";
import { costDetailsSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { messageVariants } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, ChatId, Handle, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { CHAT_OP_CODES, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import {
  appendVariantStatements,
  buildCommittedMessageView,
  commitCanonAppend,
  continueVariantStatements,
  editMessageContentStatements,
  insertCanonMessageStatements,
  MAX_CANON_APPEND_ATTEMPTS,
  selectActiveVariantStatement,
  setVariantContentStatement,
} from "../../../../../packages/server/src/domain/chat/persistence/canon-write.ts";
import { loadCanonHistory, loadMaxMessageSeq, loadSlotTarget } from "../../../../../packages/server/src/domain/chat/persistence/queries.ts";
import { continuedSignatureMetadata } from "../../../../../packages/server/src/domain/chat/substrate/content-signatures.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeGenerationUsage } from "../../../../support/factories/generation-usage.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId, testProviderId } from "../../../../support/inference-identities.ts";
import { FROZEN_AT, seedCharacter, seedChat, seedConnection, seedMessage, seedUser } from "../_support.ts";

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
  test("continue undo/revert and swipes restore their own tool sets; hand edits retain calls but clear obsolete offsets", async () => {
    const chatId = await seedChat(db, "tool-history");
    const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Before." });
    const first = {
      toolCallId: "call-1",
      turnId: mintTypeId(ID_PREFIX.chatTurn),
      callOrdinal: 0,
      name: "draw",
      arguments: "{}",
      result: "Moon",
      isError: false,
      durationMs: 1,
      textOffset: 7,
    };
    const second = { ...first, turnId: mintTypeId(ID_PREFIX.chatTurn), name: "tick", result: "1/6", textOffset: 6 };
    const metadata = continuedSignatureMetadata({
      beforeContent: "Before.",
      additionContent: "After.Done.",
      before: {},
      addition: null,
      beforeTools: [first],
      additionTools: [second],
    });
    const after = metadata?.continuationTools?.after ?? [];
    await db.batch(
      batchMany(
        continueVariantStatements(db, {
          variantId,
          variant: { content: "Before.After.Done.", metadata, toolCalls: after },
          preContinueContent: "Before.",
          preContinueReasoning: null,
          lastContinuationContent: "After.Done.",
          lastContinuationReasoning: null,
        }),
      ),
    );
    expect((await loadCanonHistory(db, chatId))[0]?.toolCalls).toEqual(after);
    expect(after[1]?.textOffset).toBe(13);
    await db.batch(batchMany([setVariantContentStatement(db, variantId, { content: "Before.", reasoning: null, undoContinuation: true })]));
    const undone = (await loadCanonHistory(db, chatId))[0];
    expect(undone?.toolCalls).toEqual([first]);
    expect(undone).not.toHaveProperty("variantMetadata");
    await db.batch(batchMany([setVariantContentStatement(db, variantId, { content: "Before.After.Done.", reasoning: null, undoContinuation: false })]));
    expect((await loadCanonHistory(db, chatId))[0]?.toolCalls).toEqual(after);
    const alternate = mintTypeId(ID_PREFIX.messageVariant);
    await db.batch(
      batchMany(
        appendVariantStatements(db, {
          messageId,
          variantId: alternate,
          idx: 1,
          now: FROZEN_AT,
          variant: { content: "A different card.", toolCalls: [{ ...first, result: "Sun" }] },
        }),
      ),
    );
    expect((await loadCanonHistory(db, chatId))[0]?.toolCalls[0]?.result).toBe("Sun");
    await db.batch(batchMany([selectActiveVariantStatement(db, messageId, variantId)]));
    expect((await loadCanonHistory(db, chatId))[0]?.toolCalls).toEqual(after);
    await db.batch(batchMany(editMessageContentStatements(db, { messageId, variantId, content: "Edited prose.", editedAt: FROZEN_AT, toolCalls: after })));
    const edited = (await loadCanonHistory(db, chatId))[0];
    expect(edited?.toolCalls.map((record) => record.name)).toEqual(["draw", "tick"]);
    expect(edited?.toolCalls.every((record) => record.textOffset === undefined)).toBe(true);
    expect((await loadSlotTarget(db, chatId, messageId))?.metadata.continuationTools).toBeUndefined();
  });
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
        model: testModelId("opus"),
        provider: testProviderId("anthropic"),
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
    expect(row?.connectionAttributionProvenance).toBe("unrecorded");
  });

  test("a generated variant records that its connection existed", async () => {
    const ownerId = await seedUser(db, castId<Handle>("attribution-owner"));
    const connectionId = await seedConnection(db, ownerId);
    const chatId = await seedChat(db, "attribution");
    const { messageId, variantId } = ids("attribution");
    const params = {
      messageId,
      variantId,
      chatId,
      seq: 1,
      role: "assistant" as const,
      now: FROZEN_AT,
      variant: { content: "generated", connectionId },
    };

    await db.batch(batchMany(insertCanonMessageStatements(db, params)));

    const [stored] = await db.select().from(messageVariants).where(eq(messageVariants.id, variantId));
    expect(stored?.connectionAttributionProvenance).toBe("recorded");
    expect(buildCommittedMessageView(params).connectionAttributionProvenance).toBe("recorded");
  });

  test("buildCommittedMessageView equals the re-read row (no round-trip needed)", async () => {
    const chatId = await seedChat(db, "a");
    const characterId = await seedCharacter(db, await seedUser(db, castId<Handle>("owner")), "aria");
    const { messageId, variantId } = ids("m1");
    const params = {
      messageId,
      variantId,
      chatId,
      seq: 1,
      role: "assistant" as const,
      characterId: characterId as CharacterId,
      now: FROZEN_AT,
      variant: {
        content: "voiced",
        costUsd: 0.002,
        finishReason: "stop" as const,
        metadata: { providerMetadata: { provider: "claude-sub" as const, outputCapReached: true as const } },
      },
    };

    await db.batch(batchMany(insertCanonMessageStatements(db, params)));

    const [reread] = await loadCanonHistory(db, chatId);
    expect(reread?.outputCapReached).toBe(true);
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
    // @orb-waive no-test-fabrication(unknown): deliberate invalid-input probe Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    const corruptDraws = "not-a-record" as unknown as UserMacroDraws;
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

// ── The head-allocation retry's BOUND (#1634 item 2) ────────────────────────────────────────────────────
// `commitCanonAppend` re-allocates when a sibling takes the seq it aimed at. Losing is normal and losing
// twice is plausible; losing FOREVER is not a busy chat, it is a defect somewhere else — and an unbounded
// retry answers that by spinning silently instead of saying so. The sibling CAS on the variable plane bounds
// its own loop the same way (`substrate/variable-ops.ts`), so the two agree on the posture.
describe("commitCanonAppend — the allocation retry is BOUNDED", () => {
  /** A db whose every append LOSES: before each batch a sibling takes the head this attempt aimed at, so the
   *  caller's insert collides with it and the head has genuinely advanced (the retry's own precondition). */
  function alwaysLosingDb(real: Db, chatId: ChatId, onAttempt: () => void): Db {
    return new Proxy(real, {
      get(target, prop): unknown {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") {
          return value;
        }
        if (prop !== "batch") {
          return value.bind(target); // bind-to-target: drizzle/libSQL private fields
        }
        return async (...args: unknown[]): Promise<unknown> => {
          onAttempt();
          const head = await loadMaxMessageSeq(real, chatId);
          await seedMessage(real, chatId, head + 1, { role: "assistant", content: `sibling ${head + 1}` });
          return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        };
      },
    }) as Db;
  }

  test("a caller that loses every allocation is REFUSED with a code, not retried forever", async () => {
    const chatId = await seedChat(db, "contended");
    let attempts = 0;
    const losing = alwaysLosingDb(db, chatId, () => {
      attempts += 1;
    });

    const err = await commitCanonAppend(losing, chatId, (seq) => ({
      statements: insertCanonMessageStatements(db, {
        ...ids(`c${seq}`),
        chatId,
        seq,
        role: "assistant",
        now: FROZEN_AT,
        variant: { content: "mine" },
      }),
      result: seq,
    })).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe(CHAT_OP_CODES.canonAppendContended);
    // The bound is real: a fixed, small number of attempts — not "until the process or the test gives up"
    // (pre-fix, this test killed its own vitest worker).
    expect(attempts).toBe(MAX_CANON_APPEND_ATTEMPTS);
  });

  test("a caller that loses ONCE still lands (the bound does not break the retry it bounds)", async () => {
    const chatId = await seedChat(db, "one-loss");
    let stolen = false;
    const flaky = new Proxy(db, {
      get(target, prop): unknown {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") {
          return value;
        }
        if (prop !== "batch") {
          return value.bind(target);
        }
        return async (...args: unknown[]): Promise<unknown> => {
          if (!stolen) {
            stolen = true;
            await seedMessage(db, chatId, (await loadMaxMessageSeq(db, chatId)) + 1, { role: "assistant", content: "sibling" });
          }
          return await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        };
      },
    }) as Db;

    const landedSeq = await commitCanonAppend(flaky, chatId, (seq) => ({
      statements: insertCanonMessageStatements(db, {
        ...ids(`f${seq}`),
        chatId,
        seq,
        role: "assistant",
        now: FROZEN_AT,
        variant: { content: "mine" },
      }),
      result: seq,
    }));

    expect(landedSeq).toBe(2); // the sibling took 1; the re-allocation took 2
    expect((await loadCanonHistory(db, chatId)).map((m) => m.content)).toEqual(["sibling", "mine"]);
  });
});

// B5 / B8 (the audit's "a field nothing keeps"): `ChatUsage.reasoningTokens` and `costDetails` are normalized on
// every wire and now PERSIST on the variant — `reasoning_tokens` (integer) and `cost_details` (a JSON sidecar whose
// only parser is `costDetailsSchema`, §5.3c class 3). B1 rides the same continue path: a continued variant's
// `tokensOut`/`costUsd` are already the CONTINUATION's, so the effort/reasoning-tokens/cost-details it applied
// re-stamp with them (a stale `costDetails` beside a fresh `costUsd` would contradict itself).
describe("persistence/canon-write — reasoning_tokens + cost_details (B5/B8) and the applied effort across a continue (B1)", () => {
  const details = { totalUsd: 0.18, promptUsd: 0.08, completionUsd: 0.1 } as const;

  test("POSITIVE: an insert stamps reasoningTokens + costDetails, and the JSON round-trips through costDetailsSchema", async () => {
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
          variant: { content: "reasoned", reasoningTokens: 17, costDetails: details, reasoningEffort: "low" },
        }),
      ),
    );
    const [row] = await db
      .select({ reasoningTokens: messageVariants.reasoningTokens, costDetails: messageVariants.costDetails })
      .from(messageVariants)
      .where(eq(messageVariants.id, variantId));
    expect(row?.reasoningTokens).toBe(17);
    expect(costDetailsSchema.parse(row?.costDetails)).toEqual(details);
  });

  test("NEGATIVE: an unreported field stays NULL (never a fabricated zero / empty record), and a malformed stored blob degrades at the read seam", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = ids("m1");
    await db.batch(
      batchMany(insertCanonMessageStatements(db, { messageId, variantId, chatId, seq: 1, role: "assistant", now: FROZEN_AT, variant: { content: "plain" } })),
    );
    const [row] = await db
      .select({ reasoningTokens: messageVariants.reasoningTokens, costDetails: messageVariants.costDetails })
      .from(messageVariants)
      .where(eq(messageVariants.id, variantId));
    expect(row?.reasoningTokens).toBeNull();
    expect(row?.costDetails).toBeNull();
    // A blob no producer of ours wrote (a hand edit, a future shape) parses to a refusal, not a crash or a cast.
    await db.run(sql`update message_variants set cost_details = '{"promptUsd":"x"}' where id = ${variantId}`);
    const [tampered] = await db.select({ costDetails: messageVariants.costDetails }).from(messageVariants).where(eq(messageVariants.id, variantId));
    expect(costDetailsSchema.safeParse(tampered?.costDetails).success).toBe(false);
  });

  test("A1 storage: reasoningParts round-trip as typed JSON; an empty list is NULL (nothing replayable); a continue replaces them", async () => {
    const chatId = await seedChat(db, "a");
    const { messageId, variantId } = ids("m1");
    const signed = [{ type: "reasoning" as const, text: "Paris needs the tool.", meta: { anthropic: { signature: "sig-1" } } }];
    await db.batch(
      batchMany(
        insertCanonMessageStatements(db, {
          messageId,
          variantId,
          chatId,
          seq: 1,
          role: "assistant",
          now: FROZEN_AT,
          variant: { content: "first", reasoning: "Paris needs the tool.", reasoningParts: signed },
        }),
      ),
    );
    const read = async (): Promise<unknown> =>
      (await db.select({ reasoningParts: messageVariants.reasoningParts }).from(messageVariants).where(eq(messageVariants.id, variantId)))[0]?.reasoningParts;
    expect(await read()).toEqual(signed);
    // A continuation that reasoned nothing replayable REPLACES the base's blocks with NULL (the rendered
    // `reasoning` text is combined by the caller; the replay material is the LAST generation's only).
    await db.batch(
      batchMany(
        continueVariantStatements(db, {
          variantId,
          variant: { content: "first and more", reasoningParts: [] },
          preContinueContent: "first",
          preContinueReasoning: null,
          lastContinuationContent: " and more",
          lastContinuationReasoning: null,
        }),
      ),
    );
    expect(await read()).toBeNull();
  });

  test("a continue re-stamps reasoningEffort + reasoningTokens + costDetails to the continuation's (beside the tokens/cost it already re-stamps)", async () => {
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
          variant: {
            ...makeGenerationUsage(0.18, {
              tokensIn: 7,
              tokensOut: 5,
              reasoningTokens: 3,
              cacheReadTokens: 6,
              cacheWriteTokens: 8,
              tokenDetails: { input: [{ modality: "text", tokens: 7 }] },
              costDetails: { ...details, pricing: { inputPerMTok: 2, outputPerMTok: 3 } },
              responseCache: { status: "hit", ageSeconds: 4, ttlSeconds: 100, sourceGenerationId: null },
            }),
            content: "first",
            reasoningEffort: "high",
          },
        }),
      ),
    );
    await db.batch(
      batchMany(
        continueVariantStatements(db, {
          variantId,
          variant: {
            ...makeGenerationUsage(0.4, {
              tokensIn: null,
              tokensOut: 9,
              reasoningTokens: 21,
              cacheReadTokens: null,
              cacheWriteTokens: 0,
              tokenDetails: { output: [{ modality: "image", tokens: 0 }] },
              responseCache: { status: "miss", ageSeconds: null, ttlSeconds: null, sourceGenerationId: null },
            }),
            content: "first and more",
            reasoningEffort: "low",
          },
          preContinueContent: "first",
          preContinueReasoning: null,
          lastContinuationContent: " and more",
          lastContinuationReasoning: null,
        }),
      ),
    );
    const [row] = await db
      .select({
        tokensOut: messageVariants.tokensOut,
        reasoningTokens: messageVariants.reasoningTokens,
        costDetails: messageVariants.costDetails,
        reasoningEffort: messageVariants.reasoningEffort,
        tokensIn: messageVariants.tokensIn,
        cacheReadTokens: messageVariants.cacheReadTokens,
        cacheWriteTokens: messageVariants.cacheWriteTokens,
        tokenDetails: messageVariants.tokenDetails,
        responseCache: messageVariants.responseCache,
        costUsd: messageVariants.costUsd,
        costProvenance: messageVariants.costProvenance,
      })
      .from(messageVariants)
      .where(eq(messageVariants.id, variantId));
    expect(row).toEqual({
      tokensOut: 9,
      reasoningTokens: 21,
      costDetails: { totalUsd: 0.4 },
      reasoningEffort: "low",
      tokensIn: null,
      cacheReadTokens: null,
      cacheWriteTokens: 0,
      tokenDetails: { output: [{ modality: "image", tokens: 0 }] },
      responseCache: { status: "miss", ageSeconds: null, ttlSeconds: null, sourceGenerationId: null },
      costUsd: 0.4,
      costProvenance: "measured",
    });
  });
});
