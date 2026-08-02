// The autocomplete catalog's DERIVATION (pure, node-safe — the module imports only `@orb/kit/macro`).
// Three properties the popover's correctness rests on, none of them visible to a typecheck:
//   · the user plane is really COMPOSED (not concatenated): a def registers onto a fresh default registry,
//     so a name that collides with a builtin is absent here for the same reason it will not resolve there;
//   · the game↔preset PRECEDENCE matches the resolver's ruled shadow (`shadowPresetUserMacros`);
//   · the curation's list delta — block forms are OFFERED now (with the pair they insert), aliases and
//     whitespace literals still are not.

import { withUserMacros } from "@orb/client/lib";
import type { UserMacroDef } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures";

function def(name: string, description = "d"): UserMacroDef {
  return { name, description, args: [], body: "x", inputs: [], strict: false };
}

const names = (list: readonly { readonly name: string }[]): string[] => list.map((s) => s.name);

test("a user macro is offered, and leads the catalog (an 8-row popover would otherwise bury it)", () => {
  const list = withUserMacros([def("scene_tone", "the scene's tone")]);
  expect(names(list)[0]).toBe("scene_tone");
  expect(list[0]?.description).toBe("the scene's tone");
  expect(list[0]?.category).toBe("user");
  // The builtins are still all there behind it.
  expect(names(list)).toContain("char");
});

test("a user macro colliding with a builtin never reaches the popover (the registry refuses it)", () => {
  const list = withUserMacros([def("char", "my own char")]);
  expect(list.filter((s) => s.name === "char")).toHaveLength(1);
  expect(list.find((s) => s.name === "char")?.description).not.toBe("my own char");
});

test("the foreign (preset) plane rides as NAMES ONLY, glossed — never an invented description or arg hint", () => {
  const list = withUserMacros([], ["house_rule"]);
  const row = list.find((s) => s.name === "house_rule");
  expect(row).toBeDefined();
  expect(row?.description).toBe("From your active preset.");
  expect(row?.args).toBeUndefined();
});

test("PRECEDENCE mirrors the resolver: the authored (game) def shadows the foreign preset name", () => {
  const list = withUserMacros([def("mood", "the GAME's mood")], ["mood"]);
  const rows = list.filter((s) => s.name === "mood");
  expect(rows).toHaveLength(1);
  expect(rows[0]?.description).toBe("the GAME's mood");
});

test("a plane-less call hands back the shared builtin array (one identity ⇒ one fuzzy index)", () => {
  expect(withUserMacros([])).toBe(withUserMacros([]));
});

test("the same defs array yields the same array identity (the memo the fuzzy index needs)", () => {
  const defs = [def("gloss")];
  expect(withUserMacros(defs)).toBe(withUserMacros(defs));
  expect(withUserMacros(defs, ["a"])).not.toBe(withUserMacros(defs));
});

test("list delta: block forms are OFFERED with the pair they insert; aliases + literals still are not", () => {
  const list = withUserMacros([]);
  const byName = new Map(list.map((s) => [s.name, s]));
  expect(byName.get("if")?.insertTemplate).toBe("{{if::$0}}{{/if}}");
  expect(byName.get("uppercase")?.insertTemplate).toBe("{{uppercase}}$0{{/uppercase}}");
  expect(byName.get("trimStart")?.insertTemplate).toBe("{{trimStart}}$0{{/trimStart}}");
  expect(byName.get("if")?.description).toContain("Picking it inserts the whole block.");
  // Still excluded: the half of an `{{if}}`, the whitespace literals, and the alias spellings.
  for (const excluded of ["else", "newline", "space", "noop", "banned", "charName", "getvar"]) {
    expect(byName.has(excluded)).toBe(false);
  }
  // `getvar` is absent only under its bare spelling — the parameterized row is what's offered.
  expect(byName.has("getvar::key")).toBe(true);
  // A non-block macro carries no insertion override at all (the default `{{name}}` path).
  expect(byName.get("char")?.insertTemplate).toBeUndefined();
});
