// @subject packages/server/src/domain/chat/assembly/history-budget.ts
// A preset that asks for more context than a connection's assumed window is fitted to the assumed window at send:
// `fitHistoryToWindow` takes min(window, the preset's cap), so the oldest history is cut to the guess, not the preset.
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "@orb/testkit/node/composed";
import { textRoom, wireOf, wireText } from "../scenario-physical.ts";

// What the imported SillyTavern preset asks for: far above the floor a server that reports nothing gets.
const PRESET_ASKS = { maxContextTokens: 128_000, maxOutputTokens: 29_828 } as const;
const HISTORY_LINES = 40;
// Enough words per line that the history alone overruns the assumed window.
const WORDS_PER_LINE = 220;

function line(index: number): string {
  return `turn ${String(index)} — ${"lantern ".repeat(WORDS_PER_LINE)}`;
}

test("a preset over an assumed window is trimmed to the assumed window at send, not to the preset's own cap", async () => {
  await using h = await textRoom(["The keeper answers."], {
    promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, ...PRESET_ASKS } }),
    transcript: Array.from({ length: HISTORY_LINES }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: line(index + 1),
    })),
  });
  // A Custom OpenAI-compatible connection whose server states no limits, as a hosted proxy's id-only model list does.
  const guessed = await h.caller.connection.create({
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    label: "Assumed-limits proxy",
    declared: { kind: "generation", features: { detectServer: false } },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: guessed.id });
  const view = await h.caller.connection.capabilities({ connectionId: guessed.id });
  if (view.capability.kind !== "generation") {
    throw new Error("The proxy connection did not resolve a generation model");
  }
  const window = view.capability.generation.context.window;
  expect(view.capability.generation.context.windowEstimated).toBe(true);
  expect(window).toBeLessThan(PRESET_ASKS.maxContextTokens);

  const fit = await h.caller.chat.previewContextFit({ chatId: h.chatId });
  if ("unbound" in fit) {
    throw new Error("The room lost its chat binding");
  }
  expect(fit).toMatchObject({ limit: { kind: "window", tokens: window }, ceilingEstimated: true });
  expect(fit.ceilingTokens).toBeLessThanOrEqual(window);
  expect(fit.droppedCount).toBeGreaterThan(0);
  expect(fit.droppedCount).toBeLessThan(HISTORY_LINES);

  const { newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on." }));
  const sent = wireText(newest);
  expect(sent).toContain(line(HISTORY_LINES));
  expect(sent).not.toContain(line(1));
});
