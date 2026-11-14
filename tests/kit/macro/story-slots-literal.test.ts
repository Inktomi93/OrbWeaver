// A stored summary or game-state value reaches its slot as literal text: the memory, compaction-summary and rpg
// slots run no macro their text holds, name macros included, while the template around them still evaluates.

import type { ProcessMacroOptions } from "@orb/kit/macro";
import { processMacros } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node";

const CHAR = "KEEPER";
const USER = "TRAVELER";
const STORED = "{{setvar::seized::1}}{{setglobalvar::seized::1}}{{{setvar::run::1}}} keeper {{char}} and {{{user}}} {{{{{char}}}}} end";

interface Slot {
  readonly name: string;
  readonly options: Partial<ProcessMacroOptions>;
}

const SLOTS: readonly Slot[] = [
  { name: "memory", options: { memory: STORED } },
  { name: "compact_summary", options: { compactSummary: STORED } },
  { name: "rpgSceneState", options: { rpgMacros: { rpgSceneState: STORED } } },
  { name: "rpgCast", options: { rpgMacros: { rpgCast: STORED } } },
  { name: "rpgQuests", options: { rpgMacros: { rpgQuests: STORED } } },
  { name: "rpgDelta", options: { rpgMacros: { rpgDelta: STORED } } },
];

function words(text: string): string {
  return text.replace(/[^\p{L}\p{N}:]+/gu, " ").trim();
}

type GlobalWrites = NonNullable<ProcessMacroOptions["globalVarWrites"]>;

function render(template: string, extra: Partial<ProcessMacroOptions>): { text: string; env: Record<string, string>; globals: GlobalWrites } {
  const env: Record<string, string> = {};
  const globalVarWrites: GlobalWrites = [];
  const text = processMacros(template, { char: CHAR, user: USER, persona: "P", scenario: "S", env, globalVars: {}, globalVarWrites, ...extra });
  return { text, env, globals: globalVarWrites };
}

// The control: a host-authored field in the same engine still runs the macros it holds.
test("a host-authored scenario field still evaluates its macros, so the absence below is the slot's doing", () => {
  const out = render("{{scenario}}", { scenario: "{{setvar::scene::1}}{{char}}" });
  expect(out.text).toBe(CHAR);
  expect(out.env).toEqual({ scene: "1" });
});

test.for(SLOTS)("the $name slot shows its stored text as typed and writes nothing", ({ name, options }) => {
  const out = render(`{{setvar::control::1}}[{{${name}}}]`, options);
  expect(words(out.text)).toBe(words(`[${STORED}]`));
  expect(out.text).not.toContain(CHAR);
  expect(out.text).not.toContain(USER);
  expect(out.env).toEqual({ control: "1" });
  expect(out.globals).toEqual([]);
});
