// @subject packages/client/src/lib/prompt-macros.ts
// The one client macro catalog: every non-builtin macro carries its real source plane, the suggestions array a
// <MacroTextarea> indexes by identity survives a re-render, and a game's editor learns the preset by name only.

import type { MacroPlane } from "@orb/client/lib";
import { macroCatalog, pluginMacroPlanes, presetNamesPlane } from "@orb/client/lib";
import type { PluginMacroView } from "@orb/contracts/plugin";
import { userMacroSchema } from "@orb/contracts/preset";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import type { UserMacroDef } from "@orb/kit/macro";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const ids = createIdSource();
const presetId = ids.typeId(ID_PREFIX.preset);
const chatId = ids.typeId(ID_PREFIX.chat);
const oracleId = ids.typeId(ID_PREFIX.plugin);
const ledgerId = ids.typeId(ID_PREFIX.plugin);
// The popover shows this many rows for a bare `{{`.
const BARE_POPOVER_ROWS = 8;

function def(name: string, description = ""): UserMacroDef {
  return userMacroSchema.parse({ name, description, body: `${name} body` });
}

function pluginView(pluginId: typeof oracleId, pluginName: string, name: string): PluginMacroView {
  return { pluginId, pluginName, name, description: `${name} from ${pluginName}` };
}

function presetPlane(defs: readonly UserMacroDef[]): MacroPlane {
  return { source: { kind: "preset", id: presetId }, current: true, defs };
}

test("a completion row names the plane its macro lives in, and a builtin names none", () => {
  const plugins = pluginMacroPlanes([pluginView(oracleId, "Oracle Deck", "plugin_oracle_omen"), pluginView(ledgerId, "Ledger", "plugin_ledger_tally")]);
  const { suggestions } = macroCatalog(presetPlane([def("house_rule")]), plugins);
  const byName = new Map(suggestions.map((row) => [row.name, row]));
  expect(byName.get("house_rule")?.source).toBe("This preset");
  expect(byName.get("plugin_oracle_omen")?.source).toBe("Plugin: Oracle Deck");
  expect(byName.get("plugin_ledger_tally")?.source).toBe("Plugin: Ledger");
  expect(byName.get("char")).not.toHaveProperty("source");
});

test("each catalog macro points at the plane that registered it, so the browser links the right editor", () => {
  const plugins = pluginMacroPlanes([pluginView(oracleId, "Oracle Deck", "plugin_oracle_omen")]);
  const { macros } = macroCatalog(presetPlane([def("house_rule")]), plugins);
  const source = (name: string): unknown => macros.find((entry) => entry.meta.name === name)?.plane?.source;
  expect(source("house_rule")).toEqual({ kind: "preset", id: presetId });
  expect(source("plugin_oracle_omen")).toEqual({ kind: "plugin", id: oracleId });
  expect(macros.find((entry) => entry.meta.name === "char")?.plane).toBeUndefined();
});

test("the suggestions array survives a re-render, so the textarea's identity-keyed index is not rebuilt per keystroke", () => {
  const authored = [def("house_rule")];
  const views = [pluginView(oracleId, "Oracle Deck", "plugin_oracle_omen")];
  const first = macroCatalog(presetPlane(authored), pluginMacroPlanes(views));
  // A re-render hands over a fresh plane object and a fresh context array carrying the same bytes.
  const second = macroCatalog(
    presetPlane(authored),
    [...pluginMacroPlanes(views)].map((plane): MacroPlane => ({ ...plane, defs: [...plane.defs] })),
  );
  expect(second.suggestions === first.suggestions).toBe(true);
  // Positive control: editing a def hands over a new defs array, and the catalog follows it.
  const edited = macroCatalog(presetPlane([def("house_rule"), def("second_rule")]), pluginMacroPlanes(views));
  expect(edited.suggestions === first.suggestions).toBe(false);
  expect(edited.suggestions.map((row) => row.name)).toContain("second_rule");
});

test("a surface with no macro in scope shares one builtin suggestions array", () => {
  const none = macroCatalog(presetPlane([]));
  expect(macroCatalog({ source: { kind: "game", id: chatId }, current: true, defs: [] }).suggestions === none.suggestions).toBe(true);
  expect(nonEmpty(none.suggestions).every((row) => row.source === undefined)).toBe(true);
});

test("plugin macros follow the lead builtins, so sixteen of them never push {{char}} out of the first popover", () => {
  const many = Array.from({ length: 16 }, (_, n) => pluginView(oracleId, "Oracle Deck", `plugin_oracle_m${String(n)}`));
  const { suggestions } = macroCatalog(presetPlane([]), pluginMacroPlanes(many));
  const firstEight = suggestions.slice(0, BARE_POPOVER_ROWS);
  expect(firstEight.map((row) => row.name)).toContain("char");
  expect(firstEight.some((row) => row.source?.startsWith("Plugin"))).toBe(false);
  expect(suggestions.filter((row) => row.source?.startsWith("Plugin"))).toHaveLength(many.length);
});

test("a game editor reads the preset by name only but knows which preset, and its own def wins a shared name without a refusal", () => {
  const game: MacroPlane = { source: { kind: "game", id: chatId }, current: true, defs: [def("mood", "the game's mood")] };
  const catalog = macroCatalog(game, [presetNamesPlane(["mood", "house_rule"], presetId)]);
  const byName = new Map(catalog.suggestions.map((row) => [row.name, row]));
  expect(byName.get("mood")).toMatchObject({ source: "This game", description: "the game's mood" });
  expect(byName.get("house_rule")).toMatchObject({ source: "Preset", description: "From your active preset." });
  expect(catalog.macros.find((entry) => entry.meta.name === "house_rule")?.plane?.source).toEqual({ kind: "preset", id: presetId });
  // The ruled shadow is not an authoring error: the server drops the preset def without a word.
  expect(catalog.rejected).toEqual([]);
});

test("a name that collides with a builtin is refused and absent, for the reason it will not resolve", () => {
  const catalog = macroCatalog(presetPlane([def("char")]));
  expect(catalog.rejected.map((r) => r.name)).toEqual(["char"]);
  expect(catalog.macros.find((entry) => entry.meta.name === "char")?.plane).toBeUndefined();
});
