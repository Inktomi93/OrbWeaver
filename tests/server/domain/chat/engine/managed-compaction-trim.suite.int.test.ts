// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/compaction.ts
// Fit trimming without a marker: a real over-window room trims, warns and commits through the native SDK route.
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { sdkEngineRoom } from "./engine-physical.ts";
import { ENGINE_SDK_REPLY } from "./engine-sdk-physical.mjs";

test("a permanent marker outage cannot wall a real over-window turn: trim, warn, commit and leave no marker", async () => {
  await using fixture = await sdkEngineRoom({ history: 16, window: 300, policy: { marker: "fail" } });
  const preview = await fixture.h.caller.chat.previewContextFit({ chatId: fixture.h.chatId });
  expect(preview).toMatchObject({ droppedCount: expect.any(Number), limit: { kind: "window", tokens: 300 } });
  if ("unbound" in preview) {
    throw new Error("the real SDK room lost its binding");
  }
  expect(preview.droppedCount).toBeGreaterThan(0);
  const outcome = await fixture.turn({ compaction: { mode: "managed" }, maxOutputTokens: 64 });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ content: ENGINE_SDK_REPLY }]);
  await fixture.h.root.settleBackground();
  expect((await fixture.marker())?.compactSummary).toBeNull();
  expect((await fixture.warnings()).map(({ payload }) => payload)).toContainEqual(expect.objectContaining({ code: "context_trimmed_no_summary" }));
});

for (const descriptionWords of [0, 2000]) {
  test(`a ${descriptionWords}-word real card retains the actual fit-trim/no-summary warning premise`, async ({ annotate }) => {
    await using fixture = await sdkEngineRoom({
      history: 160,
      window: 8000,
      policy: { marker: "fail", inspectHistory: true },
      characters: [createCharacterSchema.parse({ handle: "trim-keeper", name: "Aria", description: "word ".repeat(descriptionWords) })],
      promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: 100 } }),
    });
    const preview = await fixture.h.caller.chat.previewContextFit({ chatId: fixture.h.chatId });
    if ("unbound" in preview) {
      throw new Error("the real trim room lost its binding");
    }
    expect(preview.droppedCount).toBeGreaterThan(0);
    expect(preview.droppedCount).toBeLessThan(160);
    expect((await fixture.turn()).aborted).toBe(false);
    await fixture.h.root.settleBackground();
    const request = fixture.receipts.find(({ marker }) => !marker);
    expect(request).toBeDefined();
    expect(request?.importedSeed).toBeDefined();
    expect(request?.importedSeed?.rowCount).toBeGreaterThan(0);
    expect(request?.importedSeed?.rowCount).toBeLessThan(160);
    expect(request?.argv).toContain(`--resume=${request?.importedSeed?.sessionId}`);
    expect(request?.importedSeed?.lastText).toContain("turn 160 —");
    expect(request?.importedSeed?.firstText).not.toContain("turn 1 —");
    expect((await fixture.warnings()).map(({ payload }) => payload)).toContainEqual(expect.objectContaining({ code: "context_trimmed_no_summary" }));
    expect((await fixture.marker())?.compactSummary).toBeNull();
    await annotate(
      JSON.stringify({ descriptionWords, importedRows: request?.importedSeed?.rowCount, sessionId: request?.importedSeed?.sessionId }),
      "native-materialized-history",
    );
  });
}
