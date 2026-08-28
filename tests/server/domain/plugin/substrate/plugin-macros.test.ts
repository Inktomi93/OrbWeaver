// substrate/plugin-macros — the PLUGIN MACRO plane (plugin-ui-plane §5.15, U6). Proves the four properties the
// turn path relies on, each of which is a claim the design makes in prose and this file makes checkable:
//   1. INSTALLER SCOPE — a turn only ever sees macros of plugins THAT AUTHOR installed. There is no
//      process-global reach to gate, which is the whole reason this plane needs no host-authority check.
//   2. HOST NAMESPACING — the name that reaches the engine is `plugin_<slug'>_<name>`, assigned here from the
//      manifest slug, never the guest's spelling: a plugin can shadow neither a builtin nor another plugin.
//   3. DEGRADE-NEVER-THROW — a throwing or hanging guest resolves that macro to "" for the turn; the turn is
//      never eaten. (A macro that vanished instead would re-emit raw `{{…}}` bytes into the prompt.)
//   4. LAW 7 — the guest's answer is `neutralizeMacros`'d before it becomes a body, so plugin-authored text
//      entering the macro-EXECUTION plane cannot smuggle a `{{getglobalvar::…}}` the engine would resolve.

import type { PluginHandlerRef } from "@orb/contracts/plugin";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { globalMacroRegistry, processMacros } from "@orb/kit/macro";
import type { PluginInvokeHandler } from "../../../../../packages/server/src/domain/plugin/contract/ops.ts";
import { createPluginMacroRegistry, PLUGIN_MACROS_MAX, pluginMacroName } from "../../../../../packages/server/src/domain/plugin/substrate/plugin-macros.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ALICE = castId<UserId>("usr_alice");
const BOB = castId<UserId>("usr_bob");
const CHAT = castId<ChatId>("chat_macros");
const HANDLER = "plugin-handler-0" as PluginHandlerRef;

/** An invoker that answers with a scripted string per handler ref (and records the chat scope it was given). */
function invoker(answers: Record<string, string | (() => Promise<string>)>): {
  readonly invoke: PluginInvokeHandler;
  readonly scopes: (ChatId | null)[];
} {
  const scopes: (ChatId | null)[] = [];
  return {
    scopes,
    invoke: (handler, _argsJson, chat): Promise<string> => {
      scopes.push(chat?.chatId ?? null);
      const answer = answers[handler] ?? "";
      return typeof answer === "string" ? Promise.resolve(answer) : answer();
    },
  };
}

test("a registered macro resolves to a per-turn VALUE under its host-assigned namespace", async () => {
  const registry = createPluginMacroRegistry();
  const { invoke, scopes } = invoker({ [HANDLER]: "Ace of Cups" });
  registry.register({ installer: ALICE, slug: "oracle-deck", macros: [{ name: "draw", description: "a card", handler: HANDLER }], invoke });

  const defs = await registry.resolveForTurn(ALICE, CHAT);

  expect(defs).toEqual([{ name: "plugin_oracle_deck_draw", description: "a card", args: [], body: "Ace of Cups", inputs: [], strict: false }]);
  // The guest ran IN the turn's chat scope, so `chat.current()` works inside a macro resolver.
  expect(scopes).toEqual([CHAT]);
  // The namespace helper and the registry agree — one spelling, the `registerTool` rule (hyphens → underscores).
  expect(pluginMacroName("oracle-deck", "draw")).toBe("plugin_oracle_deck_draw");
});

test("resolution is INSTALLER-SCOPED — another user's turn sees none of it", async () => {
  const registry = createPluginMacroRegistry();
  const { invoke } = invoker({ [HANDLER]: "secret" });
  registry.register({ installer: ALICE, slug: "oracle", macros: [{ name: "draw", description: "", handler: HANDLER }], invoke });

  expect(await registry.resolveForTurn(BOB, CHAT)).toEqual([]);
  expect(await registry.resolveForTurn(ALICE, CHAT)).toHaveLength(1);
});

test("unregister removes a plugin's macros from the NEXT turn (deactivate leaves no ghost)", async () => {
  const registry = createPluginMacroRegistry();
  const { invoke } = invoker({ [HANDLER]: "x" });
  const handle = registry.register({ installer: ALICE, slug: "oracle", macros: [{ name: "draw", description: "", handler: HANDLER }], invoke });
  expect(await registry.resolveForTurn(ALICE, CHAT)).toHaveLength(1);
  handle.unregister();
  expect(await registry.resolveForTurn(ALICE, CHAT)).toEqual([]);
});

test('a THROWING resolver degrades that macro to "" — the turn is never eaten', async () => {
  const registry = createPluginMacroRegistry();
  const { invoke } = invoker({ [HANDLER]: () => Promise.reject(new Error("guest blew up")) });
  registry.register({ installer: ALICE, slug: "oracle", macros: [{ name: "draw", description: "", handler: HANDLER }], invoke });

  const defs = await registry.resolveForTurn(ALICE, CHAT);
  // The macro is still REGISTERED (with an empty body) rather than dropped: a dropped name re-emits its raw
  // `{{…}}` bytes into the assembled prompt, which is worse than rendering nothing.
  expect(defs).toHaveLength(1);
  expect(defs[0]?.body).toBe("");
});

test("a HANGING resolver is bounded by the assembly deadline and degrades the same way", async () => {
  const registry = createPluginMacroRegistry(() => 20);
  const { invoke } = invoker({ [HANDLER]: () => new Promise<string>(() => undefined) });
  registry.register({ installer: ALICE, slug: "oracle", macros: [{ name: "draw", description: "", handler: HANDLER }], invoke });

  const defs = await registry.resolveForTurn(ALICE, CHAT);
  expect(defs[0]?.body).toBe("");
});

test("LAW 7 — a guest answer carrying macro syntax is NEUTRALIZED before it becomes a body", async () => {
  const registry = createPluginMacroRegistry();
  const { invoke } = invoker({ [HANDLER]: "leak {{getglobalvar::apiKey}} here" });
  registry.register({ installer: ALICE, slug: "oracle", macros: [{ name: "draw", description: "", handler: HANDLER }], invoke });

  const defs = await registry.resolveForTurn(ALICE, CHAT);
  const body = defs[0]?.body ?? "";
  // The proof is at the ENGINE, not on the string: run the body through the real macro engine with the global
  // in scope and assert the value did NOT resolve. (Asserting on bytes would pin `neutralizeMacros`'s
  // implementation; asserting on the render pins the property the law is about.)
  const render = (text: string): string =>
    processMacros(text, { char: "", user: "", persona: "", scenario: "", env: {}, globalVars: { apiKey: "SUPER-SECRET" } });

  // THE PLANTED POSITIVE CONTROL, in the same test: the UN-neutralized string DOES leak through this exact
  // engine call. Without it a `not.toContain` would pass equally well against an engine that resolves nothing,
  // which is the shape of an assertion that cannot fail.
  expect(render("leak {{getglobalvar::apiKey}} here")).toContain("SUPER-SECRET");
  expect(render(body)).not.toContain("SUPER-SECRET");
  expect(globalMacroRegistry.get("getglobalvar")).toBeDefined();
});

test(`a plugin registering more than ${PLUGIN_MACROS_MAX} macros is refused at registration (activation-fatal)`, () => {
  const registry = createPluginMacroRegistry();
  const { invoke } = invoker({});
  const macros = Array.from({ length: PLUGIN_MACROS_MAX + 1 }, (_, i) => ({ name: `m${i}`, description: "", handler: HANDLER }));
  expect(() => registry.register({ installer: ALICE, slug: "greedy", macros, invoke })).toThrow(/at most/u);
});
