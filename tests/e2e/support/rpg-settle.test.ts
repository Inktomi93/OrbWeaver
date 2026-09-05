// tests/e2e/support/rpg-settle — the live-loop settle predicate, proven with FIXTURES (#1493). Node-lane
// (vitest) for the same reason target-guard.test.ts is: the arms that matter must be provable without a
// model, a stack, or a GPU — and the defect being pinned is precisely an arm that was true before anything
// ran, which no live run reliably catches (it just makes the assertions after it flaky).
//
// The ruling under test is preserved from the spec verbatim: BOTH outcomes are terminal (a moved state, or
// an empty delta with canon intact — the 8B ceiling, plan-for-small-hardware). What changed is the INPUT of
// the second arm: it now requires the flush to have been OBSERVED.
import { describe, expect, test } from "vitest";
import type { RpgSettleView } from "./rpg-settle.ts";
import { hasRpgFlush, rpgStateMoved, rpgTurnSettled } from "./rpg-settle.ts";

const SEEDED = "The Rusted Gate tavern";
/** The pre-seeded snapshot: canon present, nothing extracted yet. */
const UNMOVED: RpgSettleView = { ambient: { location: SEEDED }, actors: [{ volatile: { conditions: [] } }], recentBeats: [] };

describe("rpgTurnSettled", () => {
  test("an extraction that has NOT settled is not terminal — the tick-one defect (#1493 red-first)", () => {
    // Exactly the state one second after the send: the snapshot has not moved, the error ring is (normally)
    // empty, and no flush has happened. The old arm — `errors.length === 0` — returned TRUE here, so the
    // poll released immediately and every assertion after it raced the state round.
    expect(rpgTurnSettled({ view: UNMOVED, seededLocation: SEEDED, flushed: false, errorCount: 0 })).toBe(false);
  });

  test("a flushed, empty-delta, clean turn IS terminal — the honest-arms ceiling survives", () => {
    expect(rpgTurnSettled({ view: UNMOVED, seededLocation: SEEDED, flushed: true, errorCount: 0 })).toBe(true);
  });

  test("a moved state is terminal whether or not the recorder was read", () => {
    const moved: RpgSettleView = { ...UNMOVED, recentBeats: ["the door slams"] };
    expect(rpgTurnSettled({ view: moved, seededLocation: SEEDED, flushed: false, errorCount: 0 })).toBe(true);
  });

  test("a flush that landed errors is NOT a clean empty delta", () => {
    expect(rpgTurnSettled({ view: UNMOVED, seededLocation: SEEDED, flushed: true, errorCount: 1 })).toBe(false);
  });

  test("canon damage is neither arm — a vanished ambient plane must not score as 'the state moved'", () => {
    const damaged: RpgSettleView = { ambient: null, actors: [], recentBeats: [] };
    expect(rpgStateMoved(damaged, SEEDED)).toBe(false);
    expect(rpgTurnSettled({ view: damaged, seededLocation: SEEDED, flushed: true, errorCount: 0 })).toBe(false);
  });
});

describe("rpgStateMoved", () => {
  test("each of the three movement witnesses counts on its own", () => {
    expect(rpgStateMoved({ ...UNMOVED, recentBeats: ["a beat"] }, SEEDED)).toBe(true);
    expect(rpgStateMoved({ ...UNMOVED, ambient: { location: "The Ashfell road" } }, SEEDED)).toBe(true);
    expect(rpgStateMoved({ ...UNMOVED, actors: [{ volatile: { conditions: ["bleeding"] } }] }, SEEDED)).toBe(true);
    expect(rpgStateMoved(UNMOVED, SEEDED)).toBe(false);
  });

  test("an actor with no volatile plane is not a condition", () => {
    expect(rpgStateMoved({ ...UNMOVED, actors: [{}, { volatile: null }] }, SEEDED)).toBe(false);
  });
});

describe("hasRpgFlush", () => {
  test("only a `flush` phase counts — a mounted turn or a bus announcement is not a settled extraction", () => {
    expect(hasRpgFlush([])).toBe(false);
    expect(hasRpgFlush([{ event: { phase: "mount" } }, { event: { phase: "tool" } }, { event: { phase: "bus" } }])).toBe(false);
    expect(hasRpgFlush([{ event: { phase: "mount" } }, { event: { phase: "flush" } }])).toBe(true);
  });
});
