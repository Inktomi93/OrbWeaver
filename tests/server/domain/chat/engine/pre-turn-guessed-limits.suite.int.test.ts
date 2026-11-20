// @subject packages/server/src/domain/chat/engine/engine.ts
// The pre-turn managed-compaction ceiling reads the limits the turn runs with: a guessed window yields to the preset's
// Max context tokens, and a guessed max output beside a stated window reserves what the turn sends, not the guess.
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { sdkEngineRoom } from "./engine-physical.ts";
import { ENGINE_SDK_MARKER } from "./engine-sdk-physical.mjs";

// Past where an 8,192-token window compacts, and far below the preset's own context.
const LONG_HISTORY = 150;
const PRESET_CONTEXT = 128_000;
const SMALL_REPLY = 100;
// A reply ask above the half of a 32,000-token window that a request is held to.
const LARGE_REPLY = 29_828;
const STATED_WINDOW = 32_000;
// A model id no catalog row names, so its max output is a guess.
const UNLISTED_MODEL = "engine-uncurated-model";

async function compacts(options: Parameters<typeof sdkEngineRoom>[0], params: Record<string, unknown>): Promise<boolean> {
  await using fixture = await sdkEngineRoom({
    ...options,
    policy: { foreground: "fail" },
    promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, compaction: { mode: "managed" }, ...params } }),
  });
  await expect(fixture.turn()).toThrowProviderError("server");
  return (await fixture.marker()).compactSummary === ENGINE_SDK_MARKER;
}

test("a guessed max output beside a stated window reserves the reply the turn sends, so a large reply ask compacts a chat a small one leaves alone", async () => {
  const room = { history: LONG_HISTORY, window: STATED_WINDOW, model: UNLISTED_MODEL } as const;
  expect(await compacts(room, { maxOutputTokens: SMALL_REPLY })).toBe(false);
  expect(await compacts(room, { maxOutputTokens: LARGE_REPLY })).toBe(true);
});

test("a long chat on a guessed window is not compacted to the guess once the preset asks for more context", async () => {
  const params = { maxOutputTokens: SMALL_REPLY, maxContextTokens: PRESET_CONTEXT };
  expect(await compacts({ history: LONG_HISTORY, window: 8192, windowGuessed: true }, params)).toBe(false);
  // Positive control: the same chat on a window the user stated is compacted at it.
  expect(await compacts({ history: LONG_HISTORY, window: 8192 }, params)).toBe(true);
});
