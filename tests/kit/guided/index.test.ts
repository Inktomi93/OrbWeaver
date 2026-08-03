import {
  composeRewriteSteer,
  GUIDED_GAME_STEER_KINDS,
  GUIDED_GAME_STEERS,
  neutralizeMacros,
  RPG_PLOT_STEER_KINDS,
  resolveGuidedInstruction,
  ZWSP,
} from "@orb/kit/guided";
import type { ProcessMacroOptions } from "@orb/kit/macro";
import { createDefaultRegistry, processMacros, registerUserMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures.ts";

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

// --- {{base}}: the greeting-studio rewrite base text (audit §3) ---

test("{{base}} is replaced by opts.base before macro processing", () => {
  const out = resolveGuidedInstruction("Revise: {{base}}\nAdjustments: {{input}}", "make it formal", macroOpts(), { base: "hey there" });
  expect(out).toBe("Revise: hey there\nAdjustments: make it formal");
});

test("{{base}} is ABSENT when opts.base is unset — the token survives literally (greeting_new has no base)", () => {
  const out = resolveGuidedInstruction("Write fresh: {{input}}. (no base: {{base}})", "cheerful", macroOpts());
  expect(out).toBe("Write fresh: cheerful. (no base: {{base}})");
});

test("ZWSP defense: a {{char}} inside the base greeting is neutralized and never macro-evaluated", () => {
  // The stored greeting is OTHER-AUTHOR content — a macro in it must NOT re-trigger evaluation.
  const out = resolveGuidedInstruction("Base: {{base}}", "", macroOpts(), { base: "{{char}} waves" });
  expect(out).toBe(`Base: {${ZWSP}{char}${ZWSP}} waves`);
  // Proof it did not evaluate: the context char ("Alice") never appears.
  expect(out).not.toContain("Alice");
});

test("ZWSP defense on {{base}}: the inserted codepoint is exactly U+200B and sits BETWEEN the braces", () => {
  const out = resolveGuidedInstruction("{{base}}", "", macroOpts(), { base: "{{user}}" });
  expect(out[0]).toBe("{");
  expect(out.charCodeAt(1)).toBe(ZWSP_CODEPOINT);
  expect(out[2]).toBe("{");
  expect(out.charCodeAt(out.length - 2)).toBe(ZWSP_CODEPOINT);
  expect(out.at(-1)).toBe("}");
  expect(out).not.toContain("Bob");
});

test("{{base}} and {{input}} and {{char}} all coexist — base+input neutralized, template macros resolve", () => {
  const out = resolveGuidedInstruction("{{char}} rewrites {{base}} per {{input}}", "{{user}}", macroOpts(), { base: "{{user}} smiles" });
  // {{char}} (template) resolves to Alice; the base's {{user}} and the input's {{user}} are neutralized.
  expect(out).toBe(`Alice rewrites {${ZWSP}{user}${ZWSP}} smiles per {${ZWSP}{user}${ZWSP}}`);
  expect(out).not.toContain("Bob");
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

// ── WAVE MU: the optional per-turn registry param resolves a user macro in a guided template ──
test("resolveGuidedInstruction resolves a user macro when a per-turn registry is threaded", () => {
  const registry = createDefaultRegistry();
  registerUserMacros(registry, [{ name: "vibe", description: "v", args: [], body: "electric", strict: false, inputs: [] }], {
    source: { kind: "preset", id: "preset-1" },
  });
  // With the registry the user macro resolves; without it (the default) the token passes through verbatim.
  expect(resolveGuidedInstruction("{{input}} — {{vibe}}", "go", macroOpts(), { registry })).toBe("go — electric");
  expect(resolveGuidedInstruction("{{input}} — {{vibe}}", "go", macroOpts())).toBe("go — {{vibe}}");
});

// ── P5 — the game one-shot steers (the wand's Plot submenu + "Offer choices") ──
test("every GUIDED_GAME_STEER_KINDS member has a def with a label and a non-empty template", () => {
  expect(GUIDED_GAME_STEER_KINDS).toEqual([...RPG_PLOT_STEER_KINDS, "choices"]);
  for (const kind of GUIDED_GAME_STEER_KINDS) {
    const def = GUIDED_GAME_STEERS[kind];
    expect(def.label.length).toBeGreaterThan(0);
    expect(def.template.trim().length).toBeGreaterThan(0);
  }
});

test("the state-aware steers read the rpg data macros; choices teaches the exact fence grammar", () => {
  // twist/advance ground themselves in live state via the P6 macro feed (zero rpg-contract coupling).
  expect(GUIDED_GAME_STEERS.twist.template).toContain("{{rpgSceneState}}");
  expect(GUIDED_GAME_STEERS.twist.template).toContain("{{rpgQuests}}");
  expect(GUIDED_GAME_STEERS.advance.template).toContain("{{rpgSceneState}}");
  // randomized rides the {{random::…}} macro (a fresh roll per fire).
  expect(GUIDED_GAME_STEERS.randomized.template).toContain("{{random::");
  // the one-shot choices steer names the tokenizer's fence open + close markers.
  expect(GUIDED_GAME_STEERS.choices.template).toContain(":::choices");
});

test("the game steer templates resolve through the macro engine (rpg macros live, empty off-game)", () => {
  const withState = processMacros(GUIDED_GAME_STEERS.twist.template, {
    ...macroOpts(),
    rpgMacros: { rpgSceneState: "Scene: the tavern", rpgQuests: "- Find it" },
  });
  expect(withState).toContain("the tavern");
  expect(withState).toContain("Find it");
  // Off-game the rpg macros degrade to "" — the steer stays sane generic prose, never a raw token.
  const offGame = processMacros(GUIDED_GAME_STEERS.twist.template, macroOpts());
  expect(offGame).not.toContain("{{rpgSceneState}}");
});
