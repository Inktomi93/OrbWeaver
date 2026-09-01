// ui-audit in-page walker — segment: SIBLING COHORT ANATOMY.
//
// THE GAP THIS CLOSES. Every other family in this walker judges ONE element against a threshold. The
// defects a human reviewer actually reports are relational — "nine config-group rows are 16px tall while
// the sibling collection rows in the same list are 32px" (the config surface's only P0), "one concept,
// two anatomies: shipped themes are 829x66 cards, your themes are 60x20 chips", "one surface, four row
// anatomies". No per-element threshold can express any of those: 16px is not wrong, it is wrong BESIDE
// a 32px twin. So this census groups siblings that claim to be the same KIND of thing and records the
// spread of their rendered anatomy; the verdict lives in ../lib/checks-structure.ts.
//
// THE COHORT KEY IS THE AUTHOR'S OWN CLAIM, never a guess. Two siblings are the same kind when they
// share tag + data-slot + explicit role. `data-slot` is this repo's component-identity attribute (the
// same anchor `describe()` prefers), so a cohort is "the things the author built from one component"
// — exactly the population that should agree. A cohort keyed on shape or class similarity would invent
// a claim the author never made and flag every deliberately-varied list.
//
// WHY HEIGHT AND NOT A STYLE VECTOR. Height is the one property whose divergence is always legible to
// the eye and never a deliberate variant in this app's vocabulary: density lives in tiers.css, size
// lives in a tv() variant, and both apply per-cohort, not per-member. Padding/radius/border divergence
// inside one cohort is real too, but it is frequently INTENTIONAL (a selected member gains a ring), so
// it needs the selection-idiom lens rather than this one and is deliberately out of scope here.
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_CENSUS_COHORT = `  // ── sibling cohort anatomy ────────────────────────────────────────────────
  var cohortAnatomies = [];
  // Two members prove nothing: a pair that differs is as likely a header-plus-row as a defect. Three is
  // the smallest population where "most of them agree and one does not" is a statement.
  var COHORT_MIN_MEMBERS = 3;
  // Report the worst cohorts, not a census — past a handful the surface is structurally inconsistent and
  // the operator needs the offenders (snap/ops/overflow.ts's MAX_ESCAPES reasoning, same purpose).
  var COHORT_MAX_ROWS = 12;
  // Sub-4px boxes are plumbing (sr-only stubs, spacers); their height carries no anatomy.
  var COHORT_MIN_PAINTED_PX = 4;

  function cohortKey(el) {
    var slot = el.getAttribute("data-slot");
    if (!slot) return null;
    var role = el.getAttribute("role");
    return el.tagName.toLowerCase() + "|" + slot + "|" + (role === null ? "" : role.trim().toLowerCase());
  }

  // A cohort is scoped to ONE parent: same-slot elements in two different lists are two populations and
  // may legitimately differ. Keyed on the parent element itself, so no selector round-trip is needed.
  var cohortsByParent = new Map();
  for (var ci = 0; ci < allEls.length; ci += 1) {
    var cel = allEls[ci];
    var parent = cel.parentElement;
    if (parent === null || !isVisible(cel)) continue;
    var key = cohortKey(cel);
    if (key === null) continue;
    var crect = cel.getBoundingClientRect();
    if (crect.height < COHORT_MIN_PAINTED_PX) continue;
    var byKey = cohortsByParent.get(parent);
    if (byKey === undefined) {
      byKey = new Map();
      cohortsByParent.set(parent, byKey);
    }
    var members = byKey.get(key);
    if (members === undefined) {
      members = [];
      byKey.set(key, members);
    }
    // An element mid-transition is a measurement of a moment, not of a design — the same fence
    // ControlAspectInput.animating declares. One animating member voids the whole cohort's spread.
    var canim = typeof cel.getAnimations === "function" && cel.getAnimations().length > 0;
    members.push({ el: cel, height: Math.round(crect.height), animating: canim });
  }

  cohortsByParent.forEach(function (byKey, parentEl) {
    byKey.forEach(function (members, key) {
      if (members.length < COHORT_MIN_MEMBERS || cohortAnatomies.length >= COHORT_MAX_ROWS) return;
      var animating = false;
      var heights = [];
      for (var mi = 0; mi < members.length; mi += 1) {
        if (members[mi].animating) animating = true;
        heights.push(members[mi].height);
      }
      var sorted = heights.slice().sort(function (a, b) { return a - b; });
      var minH = sorted[0];
      var maxH = sorted[sorted.length - 1];
      var distinct = [];
      for (var di = 0; di < sorted.length; di += 1) {
        if (distinct.indexOf(sorted[di]) === -1) distinct.push(sorted[di]);
      }
      // The MODE is the cohort's intended anatomy; members off it are the outliers. Reporting "9 of 14
      // are 32px, 5 are 16px" is what makes the finding actionable — a bare min/max says nothing about
      // which side is the defect.
      var counts = new Map();
      for (var hi = 0; hi < heights.length; hi += 1) counts.set(heights[hi], (counts.get(heights[hi]) || 0) + 1);
      var modeHeight = heights[0];
      var modeCount = 0;
      counts.forEach(function (n, h) { if (n > modeCount) { modeCount = n; modeHeight = h; } });
      var outlier = null;
      var outlierCount = 0;
      for (var oi = 0; oi < members.length; oi += 1) {
        if (members[oi].height !== modeHeight) {
          outlierCount += 1;
          if (outlier === null) outlier = members[oi];
        }
      }
      cohortAnatomies.push({
        selector: describe(parentEl),
        cohortKey: key,
        members: members.length,
        minHeightPx: minH,
        maxHeightPx: maxH,
        modeHeightPx: modeHeight,
        modeCount: modeCount,
        outlierCount: outlierCount,
        outlierHeightPx: outlier === null ? modeHeight : outlier.height,
        outlierSelector: outlier === null ? describe(parentEl) : describe(outlier.el),
        distinctHeights: distinct.length,
        animating: animating,
      });
    });
  });
`;
