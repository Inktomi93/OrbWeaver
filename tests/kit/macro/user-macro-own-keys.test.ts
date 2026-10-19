// A user-macro or input name is author text, and MACRO_NAME_RE admits Object.prototype member names: every
// name-keyed read of the per-turn planes must address only the plane's own entries.
import type { UserMacroDef, UserMacroInputDef } from "@orb/kit/macro";
import { createDefaultRegistry, processMacros, registerUserMacros, resolveUserMacroInputs } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const INHERITED_NAMES = ["constructor", "toString"] as const;
const SOURCE = { kind: "preset", id: "preset_test" } as const;
const OPTIONS = { char: "C", user: "U", persona: "P", scenario: "S", env: {} };
const POOL = [
  { label: "Reunion", value: "reunion" },
  { label: "Betrayal", value: "betrayal" },
];
const FALLBACK = "third";

function inputNamed(name: string, kind: UserMacroInputDef["kind"]): UserMacroInputDef {
  return { kind, name, label: "", options: POOL, separator: ", ", onValue: "true", offValue: "", defaultValue: FALLBACK };
}

function macro(name: string, inputs: readonly UserMacroInputDef[]): UserMacroDef {
  return { name, description: "", args: [], body: inputs.map((input) => `[{{${input.name}}}]`).join(""), inputs, strict: false };
}

function render(def: UserMacroDef, inputBindings: Readonly<Record<string, Readonly<Record<string, string>>>>): string {
  const registry = createDefaultRegistry();
  registerUserMacros(registry, [def], { source: SOURCE, inputBindings });
  return processMacros(`{{${def.name}}}`, OPTIONS, registry);
}

test.for(INHERITED_NAMES)("a random pick named %s with no frozen draw draws fresh instead of replaying an inherited member", (name) => {
  const { bindings, draws } = resolveUserMacroInputs([inputNamed(name, "random-pick")], {}, { prng: () => 0, frozenDraws: {} });
  expect(Object.hasOwn(draws, name) ? draws[name] : undefined).toBe("reunion");
  expect(Object.hasOwn(bindings, name) ? bindings[name] : undefined).toBe("reunion");
});

test.for(INHERITED_NAMES)("a macro named %s with no threaded bindings renders its input defaults", (name) => {
  expect(render(macro(name, [inputNamed("pov", "single-select")]), {})).toBe(`[${FALLBACK}]`);
});

test.for(INHERITED_NAMES)("an input named %s missing from the threaded bindings renders empty, never an inherited member", (name) => {
  expect(render(macro("scene", [inputNamed(name, "single-select")]), { scene: {} })).toBe("[]");
});
