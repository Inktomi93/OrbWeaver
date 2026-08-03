// createVolatileOnlyRegistry — the COMMIT-TIME FREEZE pass (Chat-Macro-Resolution.md §0, the inverse of
// createNamesOnlyRegistry). It resolves ONLY the nondeterministic macros ({{roll}}/{{random}}/{{pick}}/
// {{time}}/{{date}}/…) against the turn's pinned clock/PRNG and re-emits IDENTITY + everything else verbatim,
// so a committed row's volatile VALUE is baked once while its {{user}}/{{char}} stay raw/per-view.

import type { ProcessMacroOptions } from "@orb/kit/macro";
import { createVolatileOnlyRegistry, processMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures.ts";

// 2021-01-02T03:04:05Z — a fixed epoch so every clock assertion is deterministic (no `Date.now`, per the gate).
const FIXED_NOW_MS = 1_609_556_645_000;
const UTC = "UTC";
const REGISTRY = createVolatileOnlyRegistry();

function opts(extra: Partial<ProcessMacroOptions> = {}): ProcessMacroOptions {
  return {
    char: "Alice",
    user: "Bob",
    persona: "Hero",
    scenario: "A quest",
    env: {},
    nowMs: FIXED_NOW_MS,
    timezone: UTC,
    // A fixed PRNG: {{roll:d20}} → floor(0.5*20)+1 = 11; {{random}} → floor(0.5*101) = 50;
    // {{pick::a::b::c}} → floor(0.5*3) = 1 → "b".
    random: () => 0.5,
    ...extra,
  };
}

// ── nondeterministic macros FREEZE to their pinned value ────────────────────────────────────────

test("volatile-only bakes {{roll}}/{{random}}/{{pick}} under the seeded PRNG", () => {
  expect(processMacros("{{roll:d20}}", opts(), REGISTRY)).toBe("11");
  expect(processMacros("{{random}}", opts(), REGISTRY)).toBe("50");
  expect(processMacros("{{pick::a::b::c}}", opts(), REGISTRY)).toBe("b");
});

test("volatile-only bakes the clock family against the pinned nowMs/timezone", () => {
  expect(processMacros("{{time}}", opts(), REGISTRY)).toBe("03:04:05");
  expect(processMacros("{{date}}", opts(), REGISTRY)).toBe("2021-01-02");
});

// ── IDENTITY macros pass through RAW (resolved per-view at READ, never baked at commit) ──────────

test("volatile-only re-emits identity macros verbatim (never baked)", () => {
  const out = processMacros("{{char}} tells {{user}} — {{persona}}", opts(), REGISTRY);
  expect(out).toBe("{{char}} tells {{user}} — {{persona}}");
});

test("a mixed row bakes only the volatile value, identity stays raw", () => {
  const out = processMacros("{{user}} rolled {{roll:d20}} at {{time}}", opts(), REGISTRY);
  expect(out).toBe("{{user}} rolled 11 at 03:04:05");
});

// ── var mutations + conversation-context macros are EXCLUDED from the freeze set (pass through) ──

test("volatile-only passes var-mutation macros through verbatim (not nondeterministic — stays inert)", () => {
  const out = processMacros("{{setvar::x::5}}{{incvar::x}}{{input}}", opts(), REGISTRY);
  expect(out).toBe("{{setvar::x::5}}{{incvar::x}}{{input}}");
});

// parity-plus P6: the rpg data macros + {{idle_duration}} are `volatile:true` (the cache-buster scan flags them)
// but they are READ MIRRORS — the freeze pass must NOT bake them into a committed composer body (a staged value
// would leak into canon). They are re-emitted VERBATIM (like {{input}}), staying raw for the per-turn feed to fill.
test("volatile-only passes the rpg macros + {{idle_duration}} through verbatim (read mirror, never baked)", () => {
  const body = "{{rpgSceneState}}{{rpgCast}}{{rpgQuests}}{{rpgDelta}}{{idle_duration}}";
  expect(processMacros(body, opts({ rpgMacros: { rpgSceneState: "SHOULD-NOT-BAKE" }, idleDuration: "8 minutes" }), REGISTRY)).toBe(body);
});

// ── passthrough / non-interference ──────────────────────────────────────────────────────────────

test("a no-{{ string is returned byte-identical", () => {
  const plain = "just a plain composer message, no macros.";
  expect(processMacros(plain, opts(), REGISTRY)).toBe(plain);
});

// ── the complement property: freeze (volatile-only) then names (names-only) fully resolves a row ──

test("a frozen row's identity resolves the same regardless of a live clock/PRNG", () => {
  const frozen = processMacros("{{user}} rolled {{roll:d6}}", opts(), REGISTRY);
  // A SECOND freeze with a DIFFERENT PRNG would have re-rolled a raw {{roll}} — but the baked value is a
  // literal now, so re-processing is a byte-identical no-op on the frozen digits.
  expect(processMacros(frozen, opts({ random: () => 0.99 }), REGISTRY)).toBe(frozen);
});
