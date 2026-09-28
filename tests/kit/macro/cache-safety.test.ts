// The prompt-prefix warning must follow evaluator execution, not token presence: staged reads and state
// reads invalidate a prefix, while bytes nested in a discarded or unknown-inline input do not.

import { createDefaultRegistry, macroTextInvalidatesCache } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures.ts";

const registry = createDefaultRegistry();

test("classifies staged turn data, recursive card prose, and variable reads as cache dependencies", () => {
  for (const text of [
    "{{memory}}",
    "{{databank}}",
    "{{guided_instruction}}",
    "{{description}}",
    "{{getvar::counter}}",
    "{{hasvar::counter}}",
    "{{getglobalvar::counter}}",
  ]) {
    expect(macroTextInvalidatesCache(text, registry), text).toBe(true);
  }
});

test("follows handler consumption and lazy delivery instead of scanning every nested token", () => {
  const cases: readonly { readonly text: string; readonly invalidates: boolean }[] = [
    { text: "{{noop::{{time}}}}", invalidates: false },
    { text: "{{?noop::{{time}}}}", invalidates: false },
    { text: "{{banned}}{{time}}{{/banned}}", invalidates: false },
    { text: "{{uppercase}}{{time}}{{/uppercase}}", invalidates: true },
    { text: "{{not_registered::{{time}}}}", invalidates: false },
    { text: "{{not_registered}}x{{time}}{{/not_registered}}", invalidates: true },
    { text: "{{not_registered}}", invalidates: true },
    // Eagerly evaluated writes survive a handler discarding their returned value.
    { text: "{{noop::{{incvar::counter}}}}", invalidates: true },
  ];
  for (const example of cases) {
    expect(macroTextInvalidatesCache(example.text, registry), example.text).toBe(example.invalidates);
  }
});

test("selects statically decidable if branches and retains dynamic predicates", () => {
  expect(macroTextInvalidatesCache('{{if::"1"}}fixed{{else}}{{time}}{{/if}}', registry)).toBe(false);
  expect(macroTextInvalidatesCache('{{if::"0"}}{{time}}{{else}}fixed{{/if}}', registry)).toBe(false);
  expect(macroTextInvalidatesCache("{{if::flag}}fixed{{else}}{{time}}{{/if}}", registry)).toBe(true);
});
