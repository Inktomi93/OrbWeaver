// The Data readout's reference scan (preset-surface-redesign §7). What is worth pinning here is NOT
// "it finds {{pov}}" — it is the two ways a naive scan lies to the user:
//   · a PREFIX match ({{povish}}) counted as a reference would make a rename look unsafe when it is;
//   · a FILTERED/ARGUMENT form ({{pov:upper}}, {{pov arg}}) missed would make it look safe when it is not.
// Plus the deliberate scoping calls: the factory default of an untouched marker is not the author's
// writing, and a macro that mentions itself is recursion, not a consumer.

import type { PromptConfig, PromptSection } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { scanReferences } from "../../../../../packages/client/src/features/preset/lib/reference-scan.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const VARIABLE = {
  name: "pov",
  question: "Whose view?",
  options: [
    { label: "First", value: "first" },
    { label: "Third", value: "third" },
  ],
  multiSelect: false,
  separator: ", ",
  randomPick: false,
};

function configWith(sections: PromptSection[], extra: Partial<PromptConfig> = {}): PromptConfig {
  return { ...DEFAULT_PROMPT_CONFIG, sections, variables: [VARIABLE], userMacros: [], ...extra };
}

test("a literal's body counts as a reference, and the section id rides along for the selection echo", () => {
  const config = configWith([{ type: "literal", id: "sec_1", name: "Style", role: "system", content: "Write in {{pov}} person.", enabled: true }]);
  const [entry] = scanReferences(config);
  expect(entry?.sites).toHaveLength(1);
  expect(entry?.sites[0]?.label).toBe("Style");
  expect(entry?.sites[0]?.sectionId).toBe("sec_1");
});

test("a PREFIX collision is not a reference — {{povish}} must not make {{pov}} look used", () => {
  const config = configWith([{ type: "literal", id: "sec_1", name: "Style", role: "system", content: "{{povish}} and {{povs}}", enabled: true }]);
  expect(scanReferences(config)[0]?.sites).toHaveLength(0);
});

test("filtered and argument forms ARE references — a rename must not silently miss them", () => {
  const config = configWith([
    { type: "literal", id: "sec_1", name: "Filtered", role: "system", content: "{{pov:upper}}", enabled: true },
    { type: "literal", id: "sec_2", name: "Spaced", role: "system", content: "{{ pov }}", enabled: true },
    { type: "literal", id: "sec_3", name: "Argued", role: "system", content: "{{pov first}}", enabled: true },
  ]);
  expect(scanReferences(config)[0]?.sites.map((s) => s.label)).toEqual(["Filtered", "Spaced", "Argued"]);
});

test("a marker's FACTORY default is not scanned — only the author's own custom template is", () => {
  const untouched = configWith([{ type: "marker", id: "m1", name: "Scenario", marker: "scenario", role: "system", enabled: true }]);
  expect(scanReferences(untouched)[0]?.sites).toHaveLength(0);

  const customized = configWith([{ type: "marker", id: "m1", name: "Scenario", marker: "scenario", role: "system", enabled: true, template: "{{pov}}" }]);
  expect(scanReferences(customized)[0]?.sites.map((s) => s.sectionId)).toEqual(["m1"]);
});

test("guided templates and format strings are counted as sites, with no section to select", () => {
  const config = configWith([], {
    guidedActions: { ...DEFAULT_GUIDED_ACTIONS, response: { prompt: "In {{pov}}: {{input}}", role: "system" } },
    formatStrings: { ...DEFAULT_PROMPT_CONFIG.formatStrings, continueNudge: "keep the {{pov}} voice" },
  });
  const sites = scanReferences(config)[0]?.sites ?? [];
  expect(sites.map((s) => s.label)).toEqual(["response template", "continueNudge"]);
  expect(sites.every((s) => s.sectionId === undefined)).toBe(true);
});

test("a macro body referencing ANOTHER macro is a site; referencing ITSELF is recursion, not a use", () => {
  const config: PromptConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    sections: [],
    variables: [],
    userMacros: [
      { name: "tone", description: "", args: [], body: "warm and {{style}}", inputs: [], strict: false },
      { name: "style", description: "", args: [], body: "terse, {{style}}-ish", inputs: [], strict: false },
    ],
  };
  const style = scanReferences(config).find((entry) => entry.name === "style");
  expect(style?.sites.map((s) => s.label)).toEqual(["tone macro body"]);
});
