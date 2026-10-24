// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/compaction.ts
// Measured thresholds: every search probe builds a real room and runs native exchanges, intrinsic wall time; the heavy-prompt case is tagged slow.
import { createCharacterSchema } from "@orb/contracts/character";
import { parseVariantMetadata } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { messages, messageVariants } from "@orb/db";
import { ProviderError } from "@orb/inference";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { and, desc, eq } from "drizzle-orm";
import { beforeAll, describe } from "vitest";
import { sdkEngineRoom } from "./engine-physical.ts";
import { ENGINE_SDK_MARKER } from "./engine-sdk-physical.mjs";

async function recordSystemPrompt(fixture: Awaited<ReturnType<typeof sdkEngineRoom>>, count: number, heavy: boolean): Promise<void> {
  const bootstrap = await fixture.turn({ compaction: { mode: "auto" } });
  expect(bootstrap.aborted).toBe(false);
  expect(bootstrap.messages).toHaveLength(1);
  const newest = await fixture.h.root.db
    .select({ seq: messages.seq, variantId: messageVariants.id, metadata: messageVariants.metadata })
    .from(messages)
    .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
    .where(and(eq(messages.chatId, fixture.h.chatId), eq(messages.role, "assistant")))
    .orderBy(desc(messages.seq))
    .get();
  expect(newest).toMatchObject({ seq: await fixture.seqOfRow(count), variantId: bootstrap.messages[0]?.selectedVariantId });
  expect(parseVariantMetadata(newest?.metadata).systemTokens).toBeGreaterThan(heavy ? 2000 : 0);
  expect((await fixture.marker())?.compactSummary).toBeNull();
}

async function markerAt(
  count: number,
  recordedSystem: boolean,
  foregroundFails: boolean,
  heavy: boolean,
): Promise<{ readonly compacted: boolean; readonly nativeExchanges: number }> {
  await using fixture = await sdkEngineRoom({
    history: recordedSystem ? count - 1 : count,
    window: 8192,
    characters: [createCharacterSchema.parse({ handle: "priced-keeper", name: "Aria", description: heavy ? "word ".repeat(2000) : "A bold knight." })],
    promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: 100, compaction: { mode: "managed" } } }),
  });
  if (recordedSystem) {
    await recordSystemPrompt(fixture, count, heavy);
  }
  fixture.setPolicy({ foreground: foregroundFails ? "fail" : "reply" });
  const [result] = await Promise.allSettled([fixture.turn()]);
  const expected = foregroundFails ? { status: "rejected", reason: expect.any(ProviderError) } : { status: "fulfilled", value: { aborted: false } };
  expect(result).toMatchObject(expected);
  await fixture.h.root.settleBackground();
  return { compacted: (await fixture.marker())?.compactSummary === ENGINE_SDK_MARKER, nativeExchanges: fixture.receipts.length };
}

async function firstCompactingRows(
  recordedSystem: boolean,
  foregroundFails: boolean,
  heavy = false,
  observe?: (nativeExchanges: number) => void,
): Promise<number> {
  let low = 9;
  let high = 160;
  while (low < high) {
    const count = Math.floor((low + high) / 2);
    const sample = await markerAt(count, recordedSystem, foregroundFails, heavy);
    observe?.(sample.nativeExchanges);
    if (sample.compacted) {
      high = count;
    } else {
      low = count + 1;
    }
  }
  expect(low).toBeLessThan(160);
  return low;
}

describe("the measured pre-turn threshold", () => {
  // The search is the shared input both offsets read, so it runs once here instead of inside whichever case runs first.
  const measured = Promise.withResolvers<number>();
  beforeAll(async () => {
    measured.resolve(await firstCompactingRows(false, true));
  });

  for (const offset of [-1, 0]) {
    test(`the actual pre-turn threshold ${offset === -1 ? "one-row-short refusal" : "crossing row"} is stable`, async () => {
      const threshold = await measured.promise;
      await using fixture = await sdkEngineRoom({
        history: threshold + offset,
        window: 8192,
        policy: { foreground: "fail" },
        promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: 100, compaction: { mode: "managed" } } }),
      });
      await expect(fixture.turn()).toThrowProviderError("server");
      expect((await fixture.marker())?.compactSummary).toBe(offset === -1 ? null : ENGINE_SDK_MARKER);
      expect(fixture.receipts.filter(({ marker }) => marker)).toHaveLength(offset === -1 ? 0 : 1);
    });
  }
});

test("a production-recorded heavy system prompt makes pre-turn and post-turn thresholds agree within one row", { tags: "slow" }, async ({ annotate }) => {
  const samples: number[] = [];
  const observe = (exchanges: number): void => {
    samples.push(exchanges);
  };
  // The two searches share no room, so they run side by side; each probe still runs strictly in order.
  const [postRows, preRows] = await Promise.all([firstCompactingRows(false, false, true, observe), firstCompactingRows(true, true, true, observe)]);
  await annotate(
    JSON.stringify({ postRows, preRows, probes: samples.length, nativeExchanges: samples.reduce((sum, count) => sum + count, 0) }),
    "native-compaction-search",
  );
  expect(Math.abs(preRows - postRows)).toBeLessThanOrEqual(1);
});
