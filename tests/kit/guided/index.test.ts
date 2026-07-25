import { composeRewriteSteer, neutralizeMacros, resolveGuidedInstruction, ZWSP } from "@orb/kit/guided";
import type { ProcessMacroOptions } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures";

// Fixed macro context — no Date/random, per the determinism gate.
function macroOpts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "Alice", user: "Bob", persona: "Hero", scenario: "A quest", env: {}, ...extra };
}

// The exact zero-width space the neutralizer inserts BETWEEN braces (U+200B).
const ZWSP_CODEPOINT = 0x20_0b;

test("resolveGuidedInstruction splices the steering input into the template", () => {
  const out = resolveGuidedInstruction("[Take the following into special consideration for your next message: {{input}}]", "make it tense", macroOpts());
  expect(out).toBe("[Take the following into special consideration for your next message: make it tense]");
});

test("resolveGuidedInstruction resolves the rest of the macro context, not just {{input}}", () => {
  const out = resolveGuidedInstruction("{{char}} reacts to {{user}}: {{input}}", "smile", macroOpts());
  expect(out).toBe("Alice reacts to Bob: smile");
});

test("ZWSP defense: a {{char}} in user input is neutralized and never macro-evaluated", () => {
  // Untrusted input carries a macro that, left intact, would resolve to the context char "Alice".
  const out = resolveGuidedInstruction("{{input}}", "{{char}}", macroOpts());
  // The braces survive (output looks identical to a human) but with a ZWSP wedged between each pair,
  // so it can NOT re-trigger macro evaluation.
  expect(out).toBe(`{${ZWSP}{char}${ZWSP}}`);
  // Proof it did not evaluate: the context char never appears.
  expect(out).not.toContain("Alice");
});

test("ZWSP defense: the inserted codepoint is exactly U+200B and sits BETWEEN the braces", () => {
  const out = resolveGuidedInstruction("{{input}}", "{{char}}", macroOpts());
  expect(out[0]).toBe("{");
  expect(out.charCodeAt(1)).toBe(ZWSP_CODEPOINT);
  expect(out[2]).toBe("{");
  expect(out.charCodeAt(out.length - 2)).toBe(ZWSP_CODEPOINT);
  expect(out.at(-1)).toBe("}");
});

test("{{person}} is replaced by opts.person before macro processing", () => {
  const out = resolveGuidedInstruction("Write in the {{person}}-person perspective. {{input}}", "go", macroOpts(), { person: "third" });
  expect(out).toBe("Write in the third-person perspective. go");
});

test('{{person}} defaults to "first" when unset', () => {
  const out = resolveGuidedInstruction("{{person}} person: {{input}}", "go", macroOpts());
  expect(out).toBe("first person: go");
});

test("a blank/whitespace template returns the neutralized input as a defensive floor", () => {
  const out = resolveGuidedInstruction("   ", "{{char}}", macroOpts());
  expect(out).toBe(`{${ZWSP}{char}${ZWSP}}`);
});

// --- Direct unit tests for the reusable exports (neutralizeMacros + ZWSP) ---

test("ZWSP is exactly one char and codepoint U+200B", () => {
  expect(ZWSP.length).toBe(1);
  expect(ZWSP.charCodeAt(0)).toBe(ZWSP_CODEPOINT);
});

test("neutralizeMacros wedges U+200B BETWEEN each brace pair", () => {
  const out = neutralizeMacros("{{char}}");
  expect(out[0]).toBe("{");
  expect(out.charCodeAt(1)).toBe(ZWSP_CODEPOINT);
  expect(out[2]).toBe("{");
  expect(out.charCodeAt(out.length - 2)).toBe(ZWSP_CODEPOINT);
  expect(out.at(-1)).toBe("}");
});

test("neutralizeMacros makes a user {{char}} un-evaluatable", () => {
  // The braces survive (invisible to a human) but can no longer re-trigger macro eval.
  expect(neutralizeMacros("{{char}}")).toBe(`{${ZWSP}{char}${ZWSP}}`);
});

test("neutralizeMacros leaves brace-free text unchanged", () => {
  const plain = "just some steering text, no macros here";
  expect(neutralizeMacros(plain)).toBe(plain);
});

// --- composeRewriteSteer: the Rewrite modal's toggle-fragments + free-text → ONE steer string ---

test("composeRewriteSteer joins fragments in given order, then appends the free text, terminated once", () => {
  const out = composeRewriteSteer(["Make it more concise", "Rewrite entirely in the past tense"], "drop the anachronism");
  expect(out).toBe("Make it more concise. Rewrite entirely in the past tense. drop the anachronism.");
});

test("composeRewriteSteer with only fragments (no free text) composes the fragments alone", () => {
  expect(composeRewriteSteer(["Make it more concise", "Expand it"], "")).toBe("Make it more concise. Expand it.");
});

test("composeRewriteSteer with only free text (no fragments) returns the terminated instruction", () => {
  expect(composeRewriteSteer([], "make it terse and clinical")).toBe("make it terse and clinical.");
});

test("composeRewriteSteer returns empty string when there is nothing to steer with", () => {
  expect(composeRewriteSteer([], "   ")).toBe("");
  expect(composeRewriteSteer([], "")).toBe("");
});

test("composeRewriteSteer does not double the terminator when a piece already ends with a period", () => {
  expect(composeRewriteSteer(["Rewrite in past tense."], "keep it short.")).toBe("Rewrite in past tense. keep it short.");
});

test("composeRewriteSteer trims and drops blank pieces", () => {
  expect(composeRewriteSteer(["  Make it concise  ", "   "], "  do it  ")).toBe("Make it concise. do it.");
});
