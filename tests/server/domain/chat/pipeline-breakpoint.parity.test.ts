// ── The differential oracle: §8 rolling-tail cache breakpoint parity vs neo-tavern ────────────────
//
// CHECKLIST §C1 / testing.md §6 / chat.md §8 + invariant 10. This is the `.parity.test` — the OPT-IN
// `parity` vitest project (excluded from the default `pnpm test`; run via `pnpm test:parity`). It
// validates the PARITY surface ONLY: the SHAPE-phase assembled history + the rolling cache breakpoint
// (offset + placement). Memory is a rewrite — its own .int tests, NEVER the oracle.
//
// Two live-able tiers + the skipped oracle:
//   1. reference-integrity — runs TODAY (only reads the committed JSON; needs neither the steady clone
//      nor orbweaver assembly). Proves the captured neo reference is internally consistent + matches
//      the input fixture's a-priori annotations. This is what `pnpm test:parity` asserts pre-assembly.
//   2. orbweaver-vs-neo diff — SKIPPED until chat assembly lands (Phase 5 step 2). The numeric
//      assertions are fully encoded + ready to unskip; they do NOT run (the seam `runOrbweaverShape`
//      throws until wired). UNSKIP marker is on the describe title.
//   3. live cache-token deltas — SKIPPED; needs a real backend (the scripted-override zeroes usage).
//
// Determinism: every input carries frozen ids/text (the fixture); no clock/random. The reference is
// keyed by neoHead (no wall-clock) so a re-capture is a clean diff.

import { describe, expect, test } from "vitest";
import type { ShapeCase } from "../../../support/parity-runner";
import {
  loadFixture,
  loadReference,
  rollingDelta,
  runOrbweaverShape,
  UNSKIP_WHEN,
} from "../../../support/parity-runner";

const SHA1 = /^[0-9a-f]{40}$/u;

const fixture = loadFixture();
const reference = loadReference();

function req<T>(x: T | undefined, what: string): T {
  if (x === undefined) {
    throw new Error(`fixture/reference missing: ${what}`);
  }
  return x;
}

// ── Tier 1: reference integrity (runs under `pnpm test:parity` today) ─────────────────────────────
describe("oracle reference integrity (no orbweaver assembly needed)", () => {
  test("the captured reference carries a neoHead (provenance anchor)", () => {
    expect(reference.neoHead).toMatch(SHA1);
  });

  test("every fixture case has a captured reference result", () => {
    const missing = fixture.cases
      .filter((c) => reference.cases[c.name] === undefined)
      .map((c) => c.name);
    expect(missing).toEqual([]);
  });

  test("each case's captured breakpoint matches its a-priori annotation (capture is faithful)", () => {
    const got = fixture.cases.map((c) => [
      c.name,
      reference.cases[c.name]?.cacheBreakpointFromEnd ?? null,
    ]);
    const want = fixture.cases.map((c) => [c.name, c.expectBreakpointFromEnd]);
    expect(got).toEqual(want);
  });

  test("the volatile turn is always the last element of withTail (the §8 invariant)", () => {
    const nonUserTails = fixture.cases
      .filter((c) => c.appendUserTurn !== null)
      .map((c) => reference.cases[c.name]?.withTail.at(-1)?.role)
      .filter((role) => role !== "user");
    expect(nonUserTails).toEqual([]);
  });

  test("a defined breakpoint places an in-bounds tag; only the scoped quirk is out-of-bounds (-1)", () => {
    // FLAG[neo-quirk]: the scoped prefix-collapse yields offset -1 → targetIdx === history.length →
    // the runner's bounds check discards it (no cache_control placed). orbweaver should return
    // undefined here (decide at unskip). Every OTHER defined-breakpoint case must be in-bounds.
    const outOfBounds = fixture.cases
      .map((c) => reference.cases[c.name])
      .filter((r): r is NonNullable<typeof r> => r !== undefined)
      .filter((r) => r.cacheBreakpointFromEnd !== null)
      .filter((r) => r.targetIdx === null || r.targetIdx < 0 || r.targetIdx >= r.history.length);
    expect(outOfBounds).toHaveLength(1);
    expect(
      req(reference.cases["scoped-egocentric-history"], "scoped case").cacheBreakpointFromEnd,
    ).toBe(-1);
  });

  test("the rolling pair: offset invariant + placement advances by one user/assistant pair (2)", () => {
    // The CHECKLIST §C1 cacheWrite/read DELTA, structurally: turn1 writes the prefix up to
    // turn1TargetIdx; turn2 pins the NEW tip 2 slots later, so turn1's prefix is a cache READ on
    // turn2 (the ~5300-token win). Dropping the breakpoint ⇒ both null ⇒ the silent regression.
    const { delta } = reference.rollingPair;
    expect(delta.offsetInvariant).toBe(true);
    expect(delta.turn1TargetIdx).toBe(2);
    expect(delta.turn2TargetIdx).toBe(4);
    expect(delta.placementAdvance).toBe(2);
  });

  test("the captured rolling delta is reproducible from the turn results via rollingDelta()", () => {
    const t1 = req(reference.rollingPair.turns[0], "rolling turn 1");
    const t2 = req(reference.rollingPair.turns[1], "rolling turn 2");
    expect(rollingDelta(t1, t2)).toEqual(reference.rollingPair.delta);
  });
});

// ── Tier 2: orbweaver SHAPE vs the neo reference — LIVE (assembly landed, Phase 5 chunk 7) ────────
// CHECKLIST §C1. Unskipped now that `runOrbweaverShape` is wired to the real SHAPE substrate
// (packages/server/src/domain/chat/assembly/shape.ts). Byte-matches neo on the 10 SHAPE cases, with ONE
// documented deliberate divergence (the FLAG[neo-quirk] scoped prefix-collapse — see below).
//
// FLAG[neo-quirk] — `scoped-egocentric-history`: neo returns a DEGENERATE `cacheBreakpointFromEnd:-1`
// (the egocentric fold collapses the stable prefix under squash, violating the single-volatile-tail
// invariant the offset math assumes) which the runner then SILENTLY DISCARDS (targetIdx 3 ≥
// history.length 3). chat.md §8 + Part III §12 inv 7 mandate orbweaver return `undefined` there — the
// CORRECT "no safe breakpoint", same downstream effect as neo's discard. So for that ONE case we assert
// byte-parity on the SHAPE STAGES (identical) but the DELIBERATE breakpoint divergence (orb undefined
// vs neo's discarded -1), not raw equality. Every other case is full byte-parity.
const NEO_QUIRK_DIVERGENT = "scoped-egocentric-history";

describe(`pipeline-breakpoint parity: orbweaver SHAPE vs neo — ${UNSKIP_WHEN}`, () => {
  for (const c of fixture.cases.filter((x) => x.name !== NEO_QUIRK_DIVERGENT)) {
    test(`${c.name}: assembled history + breakpoint byte-matches neo`, () => {
      const neo = req(reference.cases[c.name], c.name);
      const orb = runOrbweaverShape(c);
      // Byte-parity on the assembled SHAPE surface (history + every intermediate stage)…
      expect(orb).toEqual(neo);
      // …and the numeric breakpoint assertion called out explicitly (chat.md §8 / invariant 10).
      expect(orb.cacheBreakpointFromEnd).toBe(neo.cacheBreakpointFromEnd);
      expect(orb.targetIdx).toBe(neo.targetIdx);
    });
  }

  test(`${NEO_QUIRK_DIVERGENT}: stages byte-match neo; breakpoint is the documented divergence`, () => {
    const c = req(
      fixture.cases.find((x) => x.name === NEO_QUIRK_DIVERGENT),
      NEO_QUIRK_DIVERGENT,
    );
    const neo = req(reference.cases[NEO_QUIRK_DIVERGENT], NEO_QUIRK_DIVERGENT);
    const orb = runOrbweaverShape(c);
    // The shaped STAGES are byte-identical — the divergence is breakpoint-only.
    expect(orb.multiCharacter).toBe(neo.multiCharacter);
    expect(orb.withTail).toEqual(neo.withTail);
    expect(orb.injected).toEqual(neo.injected);
    expect(orb.squashed).toEqual(neo.squashed);
    expect(orb.named).toEqual(neo.named);
    expect(orb.history).toEqual(neo.history);
    // The documented divergence: neo's degenerate -1 (silently discarded by the runner) → orbweaver's
    // CORRECT `undefined`/null (no safe breakpoint). chat.md §8 + Part III §12 inv 7.
    expect(neo.cacheBreakpointFromEnd).toBe(-1);
    expect(orb.cacheBreakpointFromEnd).toBeNull();
    expect(orb.targetIdx).toBeNull();
  });

  test("the rolling pair byte-matches + the cacheWrite/read delta is preserved", () => {
    const orb1 = runOrbweaverShape(req(fixture.rollingPair.turns[0], "rolling fixture 1"));
    const orb2 = runOrbweaverShape(req(fixture.rollingPair.turns[1], "rolling fixture 2"));
    const ref1 = req(reference.rollingPair.turns[0], "rolling ref 1");
    const ref2 = req(reference.rollingPair.turns[1], "rolling ref 2");
    expect(orb1.cacheBreakpointFromEnd).toBe(ref1.cacheBreakpointFromEnd);
    expect(orb2.cacheBreakpointFromEnd).toBe(ref2.cacheBreakpointFromEnd);
    // The delta is the load-bearing assertion: dropping the breakpoint ⇒ both targetIdx null.
    expect(rollingDelta(orb1, orb2)).toEqual(reference.rollingPair.delta);
  });
});

// ── Tier 3: LIVE cache-token counts vs a real Anthropic turn — DOCUMENTED, SKIPPED ────────────────
// The ultimate guard (chat.md §8: "a correct reply with cacheWrite/read at 0 = regression"). Requires
// real assembly + a real Anthropic key (the `live` tag, RUN_LIVE=1) — the scripted-override zeroes
// usage, so token COUNTS aren't observable offline. The numeric expectation, encoded so it travels:
//   turn 1 → usage.cacheWriteTokens > 0  &&  usage.cacheReadTokens === 0   (writes the prefix)
//   turn 2 → usage.cacheReadTokens   > 0                                    (~5300 tokens read back)
// Unskip + tag `live` when assembly + a real backend exist; assert against two consecutive real turns.
// biome-ignore lint/suspicious/noSkippedTests: intentional — needs a real backend + RUN_LIVE=1.
describe.skip(`LIVE cache-token deltas vs real Anthropic — ${UNSKIP_WHEN} (tag: live, RUN_LIVE=1)`, () => {
  test("turn 1 writes the prefix; turn 2 reads it back (~5300 tokens)", () => {
    const _shapes: ShapeCase[] = fixture.rollingPair.turns; // the two consecutive turns to run live
    expect(_shapes).toHaveLength(2); // placeholder — see the numeric expectation in the comment above.
  });
});
