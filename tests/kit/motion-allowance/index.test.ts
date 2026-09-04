// The ratified-motion allowance (#1069) — the ONE table both motion instruments judge with. These pins
// are the reason the console `[anim]` channel and Snap's motion arm cannot drift back into disagreeing
// about ratified behaviour: they exercise the predicate itself, not either instrument's wrapper.
import type { SanctionableAnimation } from "@orb/kit/motion-allowance";
import { baseUiAttributionMismatch, isSanctionedLibraryAnimation } from "@orb/kit/motion-allowance";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

/** The shape both callers hand in: a Base UI panel height transition bound to one lifecycle phase. */
function ratifiedHeight(overrides: Partial<SanctionableAnimation> = {}): SanctionableAnimation {
  return {
    target: "[data-slot=collapsible-panel]",
    properties: ["height"],
    compositorClean: false,
    lifecycleState: { startingStyle: true, endingStyle: false, observedAt: "transition-run" },
    attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" },
    ...overrides,
  };
}

describe("isSanctionedLibraryAnimation", () => {
  test("sanctions the Base UI panel-height lifecycle in both phases", () => {
    expect(isSanctionedLibraryAnimation(ratifiedHeight())).toBe(true);
    expect(
      isSanctionedLibraryAnimation(
        ratifiedHeight({
          lifecycleState: { startingStyle: false, endingStyle: true, observedAt: "transition-run" },
          attribution: { owner: "base-ui", mechanism: "css-transition", phase: "ending-style" },
        }),
      ),
    ).toBe(true);
  });

  test("sanctions a LIFECYCLE, never the property name — an application height animation stays dirty", () => {
    expect(isSanctionedLibraryAnimation(ratifiedHeight({ lifecycleState: null, attribution: { owner: "application", mechanism: "css-transition" } }))).toBe(
      false,
    );
  });

  test("refuses a base-ui claim its bound launch state contradicts", () => {
    // Claimed the enter phase; the state bound at `transitionrun` was the exit one.
    const counterfeit = ratifiedHeight({ lifecycleState: { startingStyle: false, endingStyle: true, observedAt: "transition-run" } });
    expect(isSanctionedLibraryAnimation(counterfeit)).toBe(false);
    expect(baseUiAttributionMismatch(counterfeit)).toContain("a library-owned allowance requires one exact transition-run lifecycle state");
    // A claim with NO lifecycle field at all is the pre-#953 bundle case: unattributed, never clean.
    expect(
      isSanctionedLibraryAnimation({
        target: "[data-slot=collapsible-panel]",
        properties: ["height"],
        compositorClean: false,
        attribution: { owner: "base-ui", mechanism: "css-transition", phase: "starting-style" },
      }),
    ).toBe(false);
    // …and a web-animation claiming the library's name is not a CSS-transition lifecycle.
    expect(isSanctionedLibraryAnimation(ratifiedHeight({ attribution: { owner: "base-ui", mechanism: "web-animation", phase: "starting-style" } }))).toBe(
      false,
    );
  });

  test("refuses a property set wider than the allowance", () => {
    expect(isSanctionedLibraryAnimation(ratifiedHeight({ properties: ["height", "margin-top"] }))).toBe(false);
    expect(isSanctionedLibraryAnimation(ratifiedHeight({ properties: ["width"] }))).toBe(false);
  });

  test("never sanctions an animation nobody accused", () => {
    expect(isSanctionedLibraryAnimation(ratifiedHeight({ compositorClean: true }))).toBe(false);
  });

  test("has nothing to contradict on a non-base-ui animation", () => {
    expect(baseUiAttributionMismatch(ratifiedHeight({ attribution: { owner: "application", mechanism: "css-transition" } }))).toBeNull();
    expect(baseUiAttributionMismatch(ratifiedHeight())).toBeNull();
  });
});
