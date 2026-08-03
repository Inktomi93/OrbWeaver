// migrate-macro-blocks — THE MIGRATION GOLDEN (parity-plus §12A.tests: "old-form seed content →
// migrated → renders byte-identical to its pre-migration semantics under the new grammar"). The
// pre-migration semantics ARE the flag-form's semantics (old `{{#if}}` re-parses as the `#` flag on a
// children-mode block, which renders exactly as the old block grammar did — pinned by the pre-existing
// engine tests that passed the MG parser unchanged), so the golden is: render(original) ==
// render(migrated) == the hand-pinned expected bytes. Plus the conservatism pins: unknown-name and
// content-arg blocks are SKIPPED with a reason, close-less tags and multi-flag runs untouched, and the
// rewrite is idempotent.

import type { ProcessMacroOptions } from "@orb/kit/macro";
import { processMacros } from "@orb/kit/macro";
import { migrateMacroBlocks } from "../../scripts/codemods/migrate-macro-blocks.ts";
import { expect, test } from "../support/fixtures.ts";

function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "Aria", user: "Mara", persona: "Hero", scenario: "A quest", env: {}, ...extra };
}

// A representative owner-seed shape: conditionals (plain / comparator / else), the transform family,
// nesting, and inline var ops — everything the old block grammar could express.
const OLD_FORM_SEED = [
  '{{#if mood == "grim"}}The lights gutter.{{else}}The hearth glows.{{/if}}',
  "{{#trim}}  {{char}} greets {{user}}.  {{/trim}}",
  "{{#uppercase}}{{#trim}} beware {{/trim}}{{/uppercase}}",
  "{{setvar::hp::10}}HP {{getvar::hp}}",
].join("\n");

const MIGRATED_SEED = [
  '{{if mood == "grim"}}The lights gutter.{{else}}The hearth glows.{{/if}}',
  "{{trim}}  {{char}} greets {{user}}.  {{/trim}}",
  "{{uppercase}}{{trim}} beware {{/trim}}{{/uppercase}}",
  "{{setvar::hp::10}}HP {{getvar::hp}}",
].join("\n");

const EXPECTED_RENDER = ["The hearth glows.", "Aria greets Mara.", "BEWARE", "HP 10"].join("\n");

test("the golden: old-form seed migrates to the universal form and renders byte-identical", () => {
  const { text, rewrites, skipped } = migrateMacroBlocks(OLD_FORM_SEED);
  expect(text).toBe(MIGRATED_SEED);
  expect(rewrites).toBe(4);
  expect(skipped).toEqual([]);
  // Pre-migration semantics (the flag-form render) == post-migration render == the pinned bytes.
  expect(processMacros(OLD_FORM_SEED, opts())).toBe(EXPECTED_RENDER);
  expect(processMacros(MIGRATED_SEED, opts())).toBe(EXPECTED_RENDER);
});

test("the rewrite is idempotent — a migrated text yields zero rewrites, bytes unchanged", () => {
  const first = migrateMacroBlocks(OLD_FORM_SEED);
  const second = migrateMacroBlocks(first.text);
  expect(second.rewrites).toBe(0);
  expect(second.text).toBe(first.text);
});

test("an unknown-name paired block is SKIPPED (its wrapper bytes are the render) with a reason", () => {
  const input = "{{#quote}}stay{{/quote}}";
  const { text, rewrites, skipped } = migrateMacroBlocks(input);
  expect(text).toBe(input);
  expect(rewrites).toBe(0);
  expect(skipped).toEqual([{ name: "quote", offset: 0, reason: "unknown-name" }]);
});

test("a known content-arg block is SKIPPED (dropping # would newly apply the trim/dedent)", () => {
  const input = "{{#setvar::k}}  raw  {{/setvar}}";
  const { text, skipped } = migrateMacroBlocks(input);
  expect(text).toBe(input);
  expect(skipped).toEqual([{ name: "setvar", offset: 0, reason: "content-arg-semantics" }]);
});

test("a close-less {{#name}} tag and a multi-flag run are untouched (not the legacy block idiom)", () => {
  const input = "{{#if x}}no close here\n{{#~if y}}z{{/if}}";
  const { text, rewrites } = migrateMacroBlocks(input);
  expect(text).toBe(input);
  expect(rewrites).toBe(0);
});

test("comments and escaped openers are never rewritten (real-parser fidelity, not a regex sweep)", () => {
  const input = "{{// about {{#if}} blocks }}\\{{#if x}}literal";
  const { text, rewrites } = migrateMacroBlocks(input);
  expect(text).toBe(input);
  expect(rewrites).toBe(0);
});
