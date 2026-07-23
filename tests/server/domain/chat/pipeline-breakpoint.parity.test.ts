// ── The differential oracle: §8 rolling-tail cache breakpoint parity vs neo-tavern ────────────────
//
// CHECKLIST §C1 / Spine-Testing.md §6 / chat.md §8 + invariant 10. This is the `.parity.test` — the OPT-IN
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

import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";
import type { ShapeCase } from "../../../support/parity-runner";
import { loadFixture, loadReference, rollingDelta, runOrbweaverShape, UNSKIP_WHEN } from "../../../support/parity-runner";

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
    const missing = fixture.cases.filter((c) => reference.cases[c.name] === undefined).map((c) => c.name);
    expect(missing).toEqual([]);
  });

  test("each case's captured breakpoint matches its a-priori annotation (capture is faithful)", () => {
    const got = fixture.cases.map((c) => [c.name, reference.cases[c.name]?.cacheBreakpointFromEnd ?? null]);
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
    expect(req(reference.cases["scoped-egocentric-history"], "scoped case").cacheBreakpointFromEnd).toBe(-1);
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

// F2 — the SECOND deliberate divergence. neo squashed adjacent DISTINCT-character assistant rows BEFORE
// the name-stamp, so a group per-speaker round delivered the later speaker's line under the FIRST
// character's name (its captured `named`/`history` carry that bug: `"Aria: Aria's line\n\nKai's line"`).
// orbweaver stamps names BEFORE the final squash (shape.ts), so the merged block keeps EVERY speaker's
// label (`"…\n\nKai: Kai's line"`) — Kai's line is attributed to Kai. The PRE-name stages (withTail /
// injected / squashed) + the breakpoint are byte-identical (a per-row label never changes role-adjacency);
// the divergence is the name-stamp output only.
const F2_ATTRIBUTION_DIVERGENT = "group-per-speaker-nudge-abort";

// W6 — the THIRD deliberate divergence (D66-C, part 01 §1c/§6b; the blast-radius re-baseline, part 04).
// neo MERGED a depth-1 assistant boundary injection INTO the last stable canon row
// (`"a1 the prior tip\n\n...continues"`), mutating bytes inside the content-keyed Anthropic prefix cache →
// the WHOLE conversation re-bills every turn the note is active, and neo then ABORTED the breakpoint
// (targetIdx null). orbweaver's prefix-stable fix RE-FRAMES that volatile injection to a user operator note
// (`[Note from user: ...continues]`) at the SPLICE, so it never touches the stable prefix — the prefix is
// byte-identical turn-over-turn and the breakpoint HOLDS (offset 1). This is a DELIBERATE bytes + breakpoint
// divergence, called out here (never a silent fixture update).
const W6_PREFIX_STABLE_DIVERGENT = "depth1-assistant-boundary-squash-abort";
const DIVERGENT: ReadonlySet<string> = new Set([NEO_QUIRK_DIVERGENT, F2_ATTRIBUTION_DIVERGENT, W6_PREFIX_STABLE_DIVERGENT]);

describe(`pipeline-breakpoint parity: orbweaver SHAPE vs neo — ${UNSKIP_WHEN}`, () => {
  for (const c of fixture.cases.filter((x) => !DIVERGENT.has(x.name))) {
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

  test(`${F2_ATTRIBUTION_DIVERGENT}: pre-name stages + breakpoint match neo; the name-stamp fixes F2`, () => {
    const c = req(
      fixture.cases.find((x) => x.name === F2_ATTRIBUTION_DIVERGENT),
      F2_ATTRIBUTION_DIVERGENT,
    );
    const neo = req(reference.cases[F2_ATTRIBUTION_DIVERGENT], F2_ATTRIBUTION_DIVERGENT);
    const orb = runOrbweaverShape(c);
    // The pre-name SHAPE stages + the (nudge-aborted) breakpoint are byte-identical to neo.
    expect(orb.multiCharacter).toBe(neo.multiCharacter);
    expect(orb.withTail).toEqual(neo.withTail);
    expect(orb.injected).toEqual(neo.injected);
    expect(orb.squashed).toEqual(neo.squashed);
    expect(orb.cacheBreakpointFromEnd).toBe(neo.cacheBreakpointFromEnd);
    expect(orb.targetIdx).toBe(neo.targetIdx);
    // The DELIBERATE fix: neo lost Kai's label under squash-before-name; orbweaver keeps it.
    const neoAsst = neo.history.find((r) => r.role === "assistant" && r.content.includes("Aria's"));
    const orbAsst = orb.history.find((r) => r.role === "assistant" && r.content.includes("Aria's"));
    expect(neoAsst?.content).toBe("Aria: Aria's line\n\nKai's line");
    expect(orbAsst?.content).toBe("Aria: Aria's line\n\nKai: Kai's line");
  });

  test(`${W6_PREFIX_STABLE_DIVERGENT}: neo mutates the cached prefix + aborts; orbweaver re-frames + the breakpoint HOLDS (W6)`, () => {
    const c = req(
      fixture.cases.find((x) => x.name === W6_PREFIX_STABLE_DIVERGENT),
      W6_PREFIX_STABLE_DIVERGENT,
    );
    const neo = req(reference.cases[W6_PREFIX_STABLE_DIVERGENT], W6_PREFIX_STABLE_DIVERGENT);
    const orb = runOrbweaverShape(c);
    // withTail (the pre-splice canon + volatile tail) is byte-identical — the divergence is the SPLICE fix.
    expect(orb.withTail).toEqual(neo.withTail);

    // neo folded the depth-1 assistant note INTO the last stable canon row (prefix MUTATION) and aborted.
    const neoStableTip = neo.history[2];
    expect(neoStableTip).toEqual({
      role: "assistant",
      content: "a1 the prior tip\n\n...continues",
    });
    expect(neo.cacheBreakpointFromEnd).toBeNull();
    expect(neo.targetIdx).toBeNull();

    // orbweaver keeps the stable tip BYTE-IDENTICAL (no mutation) and re-frames the note to a user operator
    // row on the volatile tail → the prefix caches, the breakpoint holds at offset 1.
    expect(orb.history[2]).toEqual({ role: "assistant", content: "a1 the prior tip" });
    expect(orb.history.at(-1)).toEqual({
      role: "user",
      content: "[Note from user: ...continues]\n\nu2 the new turn (volatile)",
    });
    expect(orb.cacheBreakpointFromEnd).toBe(1);
    expect(orb.targetIdx).toBe(orb.history.length - 2);
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
// biome-ignore lint/suspicious/noSkippedTests: allow-skip — LIVE-only spec, needs a real backend + RUN_LIVE=1 (costs a model call); unskip per UNSKIP_WHEN above.
describe.skip(`LIVE cache-token deltas vs real Anthropic — ${UNSKIP_WHEN} (tag: live, RUN_LIVE=1)`, () => {
  test("turn 1 writes the prefix; turn 2 reads it back (~5300 tokens)", () => {
    const _shapes: ShapeCase[] = fixture.rollingPair.turns; // the two consecutive turns to run live
    expect(_shapes).toHaveLength(2); // placeholder — see the numeric expectation in the comment above.
  });
});
