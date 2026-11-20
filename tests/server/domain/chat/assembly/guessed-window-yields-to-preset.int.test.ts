// @subject packages/server/src/domain/chat/assembly/history-budget.ts
// A preset's Max context tokens outranks a guessed window: a connection whose server states no window never cuts a
// chat's history to the guess once the preset asks for more. A stated window (here, the user's own override) still
// bounds the same preset, so the guess yielding is the guess's doing and not a missing bound.
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "@orb/testkit/node/composed";
import { textRoom, wireOf, wireText } from "../scenario-physical.ts";

// What the imported SillyTavern preset asks for: far above the floor a server that reports nothing gets.
const PRESET_ASKS = { maxContextTokens: 128_000, maxOutputTokens: 29_828 } as const;
const HISTORY_LINES = 40;
// Enough words per line that the history alone overruns the assumed window.
const WORDS_PER_LINE = 220;
// A window the user states for their own server, below the preset's ask.
const STATED_WINDOW = 8192;
// A reply cap that leaves the stated window room for history.
const SMALL_REPLY = 1024;

function line(index: number): string {
  return `turn ${String(index)} — ${"lantern ".repeat(WORDS_PER_LINE)}`;
}

function longRoom(replies: readonly string[], asks: { readonly maxContextTokens: number; readonly maxOutputTokens: number }): Promise<ChatRoot> {
  return textRoom(replies, {
    promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, ...asks } }),
    transcript: Array.from({ length: HISTORY_LINES }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: line(index + 1),
    })),
  });
}

/** A Custom OpenAI-compatible connection, bound to chat, whose server states no limits, as a hosted proxy's id-only model list
 *  does; `window` is the user's own override of the window, when given. */
async function bindProxy(h: ChatRoot, window: number | null): Promise<number> {
  const connection = await h.caller.connection.create({
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    label: "Proxy",
    declared: { kind: "generation", features: { detectServer: false }, ...(window === null ? {} : { generation: { context: { window } } }) },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const view = await h.caller.connection.capabilities({ connectionId: connection.id });
  if (view.capability.kind !== "generation") {
    throw new Error("The proxy connection did not resolve a generation model");
  }
  return view.capability.generation.context.window;
}

async function sentHistory(h: ChatRoot): Promise<string> {
  const { newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on." }));
  return wireText(newest);
}

test("a preset's Max context tokens over a guessed window fits the history to the preset, not to the guess", async () => {
  await using h = await longRoom(["The keeper answers."], PRESET_ASKS);
  const guess = await bindProxy(h, null);
  expect(guess).toBeLessThan(PRESET_ASKS.maxContextTokens);

  const fit = await h.caller.chat.previewContextFit({ chatId: h.chatId });
  if ("unbound" in fit) {
    throw new Error("The room lost its chat binding");
  }
  expect(fit).toMatchObject({ limit: { kind: "window", tokens: PRESET_ASKS.maxContextTokens }, ceilingEstimated: false, droppedCount: 0 });

  const sent = await sentHistory(h);
  expect(sent).toContain(line(1));
  expect(sent).toContain(line(HISTORY_LINES));
});

test("a window the user states still bounds the same preset, so the history is trimmed to it", async () => {
  await using h = await longRoom(["The keeper answers."], { ...PRESET_ASKS, maxOutputTokens: SMALL_REPLY });
  expect(await bindProxy(h, STATED_WINDOW)).toBe(STATED_WINDOW);

  const fit = await h.caller.chat.previewContextFit({ chatId: h.chatId });
  if ("unbound" in fit) {
    throw new Error("The room lost its chat binding");
  }
  expect(fit).toMatchObject({ limit: { kind: "window", tokens: STATED_WINDOW }, ceilingEstimated: false });
  expect(fit.droppedCount).toBeGreaterThan(0);
  expect(fit.droppedCount).toBeLessThan(HISTORY_LINES);

  const sent = await sentHistory(h);
  expect(sent).toContain(line(HISTORY_LINES));
  expect(sent).not.toContain(line(1));
});
