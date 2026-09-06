// THE PROBE LADDER MUST BE ABLE TO SAY EVERY NUMBER THE RULE JUDGES (#1067).
//
// `measureHitExtent` grows a control's extent outward one radius at a time and publishes `2 x radius`, so
// `HIT_PROBE_RADII` is not a sampling detail — it is the closed VOCABULARY of answers the tap-target rule
// can ever receive. The floors it is judged against live in a different file, in a different language
// (`lib/checks-a11y.ts`, TypeScript) from the ladder (`ops/walker/hit-extent.ts`, a raw JS string evaluated
// in the page), and nothing connected them. They drifted:
//
//   ladder [11, 16, 22] → answers 22 / 32 / 44 · floors 24 (fine, AA 2.5.8) / 32 / 44 (coarse)
//
// 24 was not on that list. So every control owning 24-31px — which is the WHOLE @orb/ui selection family at
// `pointer: fine`, an 18px box under a 28px `::before size-touch-target` — could only be published as 22 and
// failed a floor it already cleared. Measured on the character library's bulk mode: `10 affected of 10
// judged; short side 22px`, on rows whose compositor ring answers `self` out to +/-13px.
//
// BOTH SIDES ARE DERIVED, neither is restated. The floors are recovered from `checkTapTarget` BEHAVIOURALLY
// (walk the size axis and find where its verdict flips), so a floor edit is seen here without exporting a
// constant for the test's convenience; the ladder is parsed out of the walker string. Every derivation is
// floor-guarded and carries a PLANTED CONTROL, because a regex that silently stops matching returns `[]`
// and every set comparison then passes vacuously (the census-tier.test.ts lesson).
//
// The RENDERED half — that a real `@orb/ui` Checkbox in a real list measures >= 24 while a real 22px box
// still fails — is `tests/tooling/design-audit-walker.ct.tsx` (#1067); only a browser can prove that. This
// file is the coupling: it goes red when a floor moves and no rung follows it.
import { describe } from "vitest";
import { checkTapTarget } from "../../../../../tooling/src/ui-audit/lib/checks-a11y.ts";
import { WALKER_HIT_EXTENT } from "../../../../../tooling/src/ui-audit/ops/walker/hit-extent.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

const LADDER_PATTERN = /var HIT_PROBE_RADII = \[([^\]]+)\]/;
/** #1829: the ring must be sampled INSIDE the rung. A target of extent `2r` occupies `[c - r, c + r)`, so
 *  the coordinate `c + r` is the neighbour's first pixel and the top rung is unreachable without an inset.
 *  Both halves are derived from the walker string — the constant AND the ring that must consume it, because
 *  a declared-but-unused inset reads exactly like a fixed walker. */
const INSET_PATTERN = /var HIT_PROBE_INSET = ([\d.]+)/;
const INSET_RING_PATTERN = /var p = r - HIT_PROBE_INSET;/;
/** Wide enough to contain every floor the rule can hold (the widest is the AAA 44px touch target). */
const SIZE_SCAN_MAX = 80;

function ladderOf(walkerSource: string): readonly number[] {
  const matched = LADDER_PATTERN.exec(walkerSource);
  if (matched === null) {
    return [];
  }
  return (matched[1] ?? "")
    .split(",")
    .map((piece) => Number.parseInt(piece.trim(), 10))
    .filter((value) => Number.isFinite(value));
}

/** The smallest square side at which `checkTapTarget` stops minting a finding — the rule's own floor,
 *  recovered from its behaviour rather than from a constant this test would otherwise have to re-spell. */
function floorFor(pointerCoarse: boolean, severity: "P1" | "P2"): number {
  for (let side = 1; side <= SIZE_SCAN_MAX; side += 1) {
    const finding = checkTapTarget({ height: side, selector: "[data-testid=probe]", width: side }, pointerCoarse);
    if (finding === null || (severity === "P1" && finding.severity !== "P1")) {
      return side;
    }
  }
  return Number.NaN;
}

/** Every floor a run can be judged against: the fine-pointer AA minimum, and the coarse hard/recommended
 *  pair. Each is the side length at which the verdict changes, so each needs a rung at HALF its value. */
function judgedFloors(): readonly number[] {
  return [floorFor(false, "P1"), floorFor(true, "P1"), floorFor(true, "P2")];
}

describe("the hit-extent ladder and the tap-target floors", () => {
  test("every floor the rule judges is expressible by a probe radius", () => {
    const floors = judgedFloors();
    expect(
      floors.every((floor) => Number.isFinite(floor)),
      `a floor was not recoverable from checkTapTarget — got ${JSON.stringify(floors)}`,
    ).toBe(true);

    const ladder = ladderOf(WALKER_HIT_EXTENT);
    expect(ladder.length, "the ladder parse found no radii — the derivation is blind, not the walker clean").toBeGreaterThan(0);

    const unexpressible = floors.filter((floor) => !ladder.includes(floor / 2));
    expect(
      unexpressible,
      `a floor with no rung can never be CLEARED: a control that owns exactly that many pixels is published as the rung below it. ladder=${JSON.stringify(ladder)} floors=${JSON.stringify(floors)}`,
    ).toEqual([]);
  });

  test("PLANTED CONTROL: dropping the fine-pointer rung is reported, so the comparison can fail", () => {
    const ladder = ladderOf(WALKER_HIT_EXTENT);
    const fineFloor = floorFor(false, "P1");
    const blinded = ladder.filter((radius) => radius !== fineFloor / 2);
    expect(blinded.length, "the planted control removed nothing — the fine rung was already absent").toBe(ladder.length - 1);
    expect(
      judgedFloors().filter((floor) => !blinded.includes(floor / 2)),
      "the comparison must name the floor whose rung was removed",
    ).toEqual([fineFloor]);
  });

  test("PLANTED CONTROL: a walker string whose ladder cannot be found reports zero radii, never a pass", () => {
    expect(ladderOf(WALKER_HIT_EXTENT.replace("var HIT_PROBE_RADII", "var RENAMED_RADII"))).toEqual([]);
  });

  // #1829 — the rung being IN the ladder is not enough; the ring must be able to LAND on it. Measured
  // 2026-09-06: an @orb/ui Checkbox at a coarse pointer answers `self` on all four cardinals at +/-21.5px
  // and answers a sibling label at +/-22px, so probing AT r=22 published 32 against a 44px floor and filed
  // a P2 no design change could clear. The RENDERED half is design-audit-walker.ct.tsx's coarse describe;
  // this is the coupling that goes red if the inset is removed or declared and never used.
  test("the ring is sampled INSIDE the rung, so the top rung is reachable at all", () => {
    const inset = INSET_PATTERN.exec(WALKER_HIT_EXTENT);
    expect(inset, "no HIT_PROBE_INSET in the walker — the derivation is blind, not the walker clean").not.toBeNull();
    const value = Number(inset?.[1] ?? Number.NaN);
    expect(value, "the inset must be a sub-pixel step: 0 re-creates the boundary probe, >=1 skips real pixels").toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
    expect(INSET_RING_PATTERN.test(WALKER_HIT_EXTENT), "HIT_PROBE_INSET is declared but the ring does not consume it").toBe(true);
  });

  test("PLANTED CONTROL: a ring rebuilt on the bare radius is reported, so the check above can fail", () => {
    const boundaryProbe = WALKER_HIT_EXTENT.replace("var p = r - HIT_PROBE_INSET;", "var p = r;");
    expect(boundaryProbe, "the planted control changed nothing — the ring was not inset to begin with").not.toBe(WALKER_HIT_EXTENT);
    expect(INSET_RING_PATTERN.test(boundaryProbe)).toBe(false);
  });
});
