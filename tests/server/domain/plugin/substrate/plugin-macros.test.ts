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
import { pluginToolWireName } from "@orb/contracts/plugin";
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
const OTHER_HANDLER = "plugin-handler-1" as PluginHandlerRef;

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

  // #1391 — the LIVE name doubles the slug's hyphen (the injective mint), and the pre-#1391 spelling rides
  // along as a degrade alias over the SAME resolved value (see the legacy-alias tests below).
  expect(defs).toEqual([
    { name: "plugin_oracle__deck_draw", description: "a card", args: [], body: "Ace of Cups", inputs: [], strict: false },
    { name: "plugin_oracle_deck_draw", description: "a card", args: [], body: "Ace of Cups", inputs: [], strict: false },
  ]);
  // The guest ran IN the turn's chat scope, so `chat.current()` works inside a macro resolver — ONCE, even
  // though two names now point at the answer.
  expect(scopes).toEqual([CHAT]);
  // The namespace helper and the registry agree — ONE spelling, delegated to the tool mint (#1391).
  expect(pluginMacroName("oracle-deck", "draw")).toBe("plugin_oracle__deck_draw");
  expect(pluginMacroName("oracle-deck", "draw")).toBe(pluginToolWireName("oracle-deck", "draw"));
});

test("#1391 the LEGACY macro spelling still resolves when exactly one macro claims it (prose is not migratable)", async () => {
  // A host who wrote `{{plugin_oracle_deck_omen}}` into a persona note before the injective rename has prose
  // no migration can reach — a row rewrite can fix a `ToolCallRecord.name`, never a sentence a human typed.
  // So the old spelling is served as an ALIAS over the same per-turn value, at the one resolution seam.
  const registry = createPluginMacroRegistry();
  const { invoke, scopes } = invoker({ [HANDLER]: "Ace of Cups" });
  registry.register({ installer: ALICE, slug: "oracle-deck", macros: [{ name: "omen", description: "", handler: HANDLER }], invoke });

  const defs = await registry.resolveForTurn(ALICE, CHAT);
  const byName = new Map(defs.map((def) => [def.name, def.body]));

  expect(byName.get("plugin_oracle__deck_omen")).toBe("Ace of Cups");
  expect(byName.get("plugin_oracle_deck_omen")).toBe("Ace of Cups");
  // ONE guest invoke for the two names — the alias reuses the resolved value, never a second resolution.
  expect(scopes).toEqual([CHAT]);
});

test("#1391 an AMBIGUOUS legacy spelling resolves to nothing — the alias refuses to pick a winner", async () => {
  // This is the pre-#1391 defect itself, staged: `a-b`/`c_d` and `a-b-c`/`d` BOTH spelled `plugin_a_b_c_d`
  // under the old flattening, which is exactly why the second one's install used to die. The injective mint
  // lets them coexist — and the alias plane must NOT then invent a precedence rule the author never chose, so
  // the ambiguous OLD name is served by neither and stays unresolved, exactly as it behaves today.
  const registry = createPluginMacroRegistry();
  const { invoke } = invoker({ [HANDLER]: "a", [OTHER_HANDLER]: "b" });
  registry.register({ installer: ALICE, slug: "a-b", macros: [{ name: "c_d", description: "", handler: HANDLER }], invoke });
  registry.register({ installer: ALICE, slug: "a-b-c", macros: [{ name: "d", description: "", handler: OTHER_HANDLER }], invoke });

  const names = (await registry.resolveForTurn(ALICE, CHAT)).map((def) => def.name);

  // Both LIVE names are there and they are DISTINCT — that coexistence is the whole point of the row.
  expect(names).toEqual(["plugin_a__b_c_d", "plugin_a__b__c_d"]);
  // …and the one legacy spelling they used to share is claimed by neither.
  expect(names).not.toContain("plugin_a_b_c_d");
});

test("#1391 a legacy alias NEVER shadows a live name, and never duplicates one", async () => {
  // `oracle-deck`/`omen`'s legacy spelling is `plugin_oracle_deck_omen`, which is ALSO the live name the
  // non-hyphenated slug `oracle` mints for a tool called `deck_omen`. The live name wins; no alias is added.
  const registry = createPluginMacroRegistry();
  const { invoke } = invoker({ [HANDLER]: "hyphenated", [OTHER_HANDLER]: "live" });
  registry.register({ installer: ALICE, slug: "oracle-deck", macros: [{ name: "omen", description: "", handler: HANDLER }], invoke });
  registry.register({ installer: ALICE, slug: "oracle", macros: [{ name: "deck_omen", description: "", handler: OTHER_HANDLER }], invoke });

  const defs = await registry.resolveForTurn(ALICE, CHAT);
  const names = defs.map((def) => def.name);

  expect(names).toEqual(["plugin_oracle__deck_omen", "plugin_oracle_deck_omen"]);
  // The name is the LIVE `oracle`/`deck_omen` macro's, not the hyphenated plugin's alias.
  expect(defs.find((def) => def.name === "plugin_oracle_deck_omen")?.body).toBe("live");
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
