// D46 "macro engine … DoS-bounded" claim — the DEPTH bound pinned via TEMPLATE nesting (the recursion
// seam ST's suite never exercises against ours). The existing index.test.ts already pins: field
// self-reference trips depth + warns once; the 1 MB output cap truncates + warns once. This file closes
// the remaining gap — a legitimately-deep NESTED-BLOCK template renders, and one past MAX_DEPTH aborts to
// "" with a single warning (engine.ts MAX_DEPTH = 64; the guard wraps every evaluateString/evaluateAST
// re-entry). A hostile card can nest blocks arbitrarily deep; this proves the cap catches it.

import type { MacroRegistry, ProcessMacroOptions } from "@orb/kit/macro";
import { createDefaultRegistry, parseMacros, processMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures.ts";

const MAX_DEPTH = 64; // mirrors engine.ts (the value is @internal; this test-mirror is the intended pin)

function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return { char: "C", user: "U", persona: "P", scenario: "S", env: {}, ...extra };
}

// Wrap `x` in N levels of `{{uppercase}}…{{/uppercase}}` — each level is one evaluateAST re-entry, so N
// levels consume N depth units. A pure structural nest (no side effects), so the only thing under test is
// the depth accounting.
function nestUppercase(levels: number): string {
  let inner = "x";
  for (let i = 0; i < levels; i += 1) {
    inner = `{{uppercase}}${inner}{{/uppercase}}`;
  }
  return inner;
}

test("deep-but-bounded block nesting renders without tripping the depth cap", () => {
  // A few levels below MAX_DEPTH renders fully — the cap is generous, not hair-trigger (real prompts are
  // shallow). 60 nested uppercase blocks fold "x" → "X".
  const warnings: string[] = [];
  const out = processMacros(nestUppercase(MAX_DEPTH - 4), opts({ onWarn: (m) => warnings.push(m) }));
  expect(out).toBe("X");
  expect(warnings).toHaveLength(0);
});

test("block nesting past MAX_DEPTH aborts to empty and warns exactly once", () => {
  // Well past the 64-level cap → the depth guard trips, rendering aborts to "" (latched), and the depth
  // warning fires exactly once (not once per level).
  const warnings: string[] = [];
  const out = processMacros(nestUppercase(MAX_DEPTH * 3), opts({ onWarn: (m) => warnings.push(m) }));
  expect(out).toBe("");
  expect(warnings.filter((w) => w.includes("depth limit"))).toHaveLength(1);
});

// ── M1 scoped-block bodies ride the SAME budget (§12A.1: "a body never escapes the MacroBudget") ──

test("deep UNKNOWN-block nesting trips the depth cap (children route through ctx.evaluateAST)", () => {
  // Each unknown-block level re-enters via ctx.evaluateAST — the guard charges depth exactly like a
  // known transform, so a hostile card can't stack-bomb through unregistered names.
  let inner = "x";
  for (let i = 0; i < MAX_DEPTH * 3; i += 1) {
    inner = `{{mysterybox}}${inner}{{/mysterybox}}`;
  }
  const warnings: string[] = [];
  processMacros(inner, opts({ onWarn: (m) => warnings.push(m) }));
  expect(warnings.filter((w) => w.includes("depth limit"))).toHaveLength(1);
});

test("a content-as-last-arg block body past the output cap truncates and warns once", () => {
  // {{setvar::k}}<1.5MB body>{{/setvar}} — the body resolves through the SAME budget before it becomes
  // the last unnamed arg, so an oversized body trips the 1MB output cap instead of ballooning memory.
  const half = 500_000;
  const chunk = "x".repeat(half);
  const body = `${chunk}{{noop}}${chunk}{{noop}}${chunk}`;
  const warnings: string[] = [];
  processMacros(`{{setvar::k}}${body}{{/setvar}}`, opts({ onWarn: (m) => warnings.push(m) }));
  expect(warnings.filter((w) => w.includes("output limit"))).toHaveLength(1);
});

// ── M2: the LAZY path (delayArgResolution / `?` + ctx.resolve) rides the SAME budget (§12A.2) ──────
// "Budget/depth guards apply identically on the lazy path" — a handler resolving its raw args late
// re-enters through ctx.resolve → the guarded evaluateString/evaluateAST seams, so neither cap is
// escapable by deferring resolution.

// A lazy echo: raw args in, ctx.resolve on demand — the minimal resolve()-contract handler.
function lazyEchoRegistry(): MacroRegistry {
  const registry = createDefaultRegistry();
  registry.register("lazyecho", (args, ctx) => ctx.resolve(args[0] ?? ""), { delayArgResolution: true });
  return registry;
}

test("nested lazy resolve() past MAX_DEPTH trips the depth cap and warns once", () => {
  // Each {{lazyecho::…}} level defers its arg and resolves it inside the handler — one ctx.resolve
  // re-entry per level. The depth guard charges the lazy path exactly like the eager one.
  let inner = "x";
  for (let i = 0; i < MAX_DEPTH * 3; i += 1) {
    inner = `{{lazyecho::${inner}}}`;
  }
  const warnings: string[] = [];
  const out = processMacros(inner, opts({ onWarn: (m) => warnings.push(m) }), lazyEchoRegistry());
  expect(out).toBe("");
  expect(warnings.filter((w) => w.includes("depth limit"))).toHaveLength(1);
});

test("lazy resolve() of expanding content past the output cap truncates and warns once", () => {
  // The handler lazily resolves an arg whose expansion is huge (an env read via the catch-all) —
  // the resolved bytes charge the SAME output budget, so repeated lazy expansion trips the 1MB cap.
  const big = "y".repeat(600_000);
  const warnings: string[] = [];
  processMacros("{{lazyecho::{{big}}}}{{lazyecho::{{big}}}}", opts({ env: { big }, onWarn: (m) => warnings.push(m) }), lazyEchoRegistry());
  expect(warnings.filter((w) => w.includes("output limit"))).toHaveLength(1);
});

// ── PARSE-TIME bound: the parser is O(n), not O(n²) (2026-08-09 DoS audit, findings #1/#2) ──────────────
// The parser runs BEFORE the engine's depth/output budget, so a quadratic parse is a DoS the eval-time caps
// cannot catch. There were TWO O(n²) sources: the old `spanAt` re-scanned line/col from index 0 per tag,
// and `buildBlocks` unwound each never-closed inline candidate with a cascading spread-copy. Together a
// 100 KB `{{a}}`-packed card field blocked the event loop ~4.4 s (20 KB=168 ms → 80 KB=2.9 s — textbook
// quadratic). The monotonic span cursor + the single-pass frame flush make it O(n): 200 KB parses in ~17 ms.
//
// The BOUND is the vitest test TIMEOUT, not an ambient-clock reading — the test-determinism gate bans
// ambient clocks in test SOURCE, and a timeout is both gate-legal and a harder guarantee. 200 000 chars is
// sized so the OLD quadratic (~17 s) blows the 4 s timeout by 4×, while the O(n) parser (~17 ms) clears it
// by >200× even under heavy multi-lane CI load. If this ever times out, the parser regressed to super-linear.
test("parsing a 200 KB macro-dense field stays O(n) — completes well inside the timeout (quadratic parse is dead)", () => {
  // 40 000 minimal `{{a}}` tags = 200 000 chars — 2× the TEXT_MAX / CONTENT_MAX ceiling an imported ST
  // card / shared lorebook can carry, so the quadratic signal is unmistakable.
  const dense = "{{a}}".repeat(40_000);
  expect(dense.length).toBe(200_000);
  const ast = parseMacros(dense);
  // Proof it parsed every tag (not short-circuited): 40 000 macro nodes, all named "a".
  expect(ast).toHaveLength(40_000);
  expect(ast[0]).toMatchObject({ type: "macro", name: "a" });
}, 4000);

// ── The engine INPUT belt: refuse a pathological input before parsing (2026-08-09 DoS audit, guard #2) ──
// Defense-in-depth — the engine does not trust that every call site capped its input. Over MAX_INPUT_BYTES
// (2 MB) it degrades-don't-throw: warn once, render "". A legit 100 KB card field is 20× under the cap.
const MAX_INPUT_BYTES = 2_000_000; // mirrors engine.ts (the value is @internal; this test-mirror is the pin)

test("an input past MAX_INPUT_BYTES is refused before parse — warns once and renders empty", () => {
  const oversized = "a".repeat(MAX_INPUT_BYTES + 1);
  const warnings: string[] = [];
  const out = processMacros(oversized, opts({ onWarn: (m) => warnings.push(m) }));
  expect(out).toBe("");
  expect(warnings.filter((w) => w.includes("input limit"))).toHaveLength(1);
});

test("a legit 100 KB card-sized field passes the input belt untouched", () => {
  // The belt admits the real 100 KB ceiling — it stops megabytes, not cards. Plain prose (no macros) is
  // returned byte-identical, proving the belt did not short-circuit a legitimate large field.
  const cardField = "x".repeat(100_000);
  const warnings: string[] = [];
  const out = processMacros(cardField, opts({ onWarn: (m) => warnings.push(m) }));
  expect(out).toBe(cardField);
  expect(warnings).toHaveLength(0);
});
