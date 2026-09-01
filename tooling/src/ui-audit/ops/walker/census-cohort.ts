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
  // ── row void: a label and its control with an ocean between them ──────────
  // "Every setting row is two lonely islands with an ocean between them" — a 654px gap between a 75px
  // label and a 48px switch, in a control column that MOVES between panes (613 / 1016 / 1255), so the eye
  // re-learns the traverse per pane. This is not "clean", it is evacuated, and no per-element rule can see
  // it: both islands are individually fine.
  //
  // THE FENCE IS THE BINDING, NOT THE GAP. A wide gap is only a defect when the two flanks are BOUND —
  // a label and the control it names. A topbar with a title left and actions right is chrome and is
  // supposed to span its width. So a row qualifies only when the left flank carries text and the right
  // flank is (or holds) an interactive control: a form row, evacuated.
  var rowVoids = [];
  var VOID_MIN_RATIO = 0.45;
  var VOID_MIN_PX = 240;
  var VOID_MAX_ROWS = 8;
  var VOID_MIN_FLANK_PX = 4;

  function voidFlankText(el) {
    // \\s, not \\\\s: this is a TEMPLATE LITERAL, so a single backslash is consumed as an escape and
    // the emitted regex becomes /s+/g — which silently replaces the LETTER s. Caught by a fixture
    // reading back "Avatar  hape"; every sibling census writes it the same way for the same reason.
    var t = (el.textContent || "").replace(/\\s+/g, " ").trim();
    return t.length > 40 ? t.slice(0, 40) : t;
  }

  for (var vi = 0; vi < allEls.length && rowVoids.length < VOID_MAX_ROWS; vi += 1) {
    var vrow = allEls[vi];
    if (!isVisible(vrow)) continue;
    var vstyle = getComputedStyle(vrow);
    if (vstyle.display !== "flex" && vstyle.display !== "grid") continue;
    var vrect = vrow.getBoundingClientRect();
    if (vrect.width < VOID_MIN_PX) continue;
    // Direct children only: a gap between grandchildren belongs to whichever row actually lays them out.
    var vkids = [];
    for (var vk = 0; vk < vrow.children.length; vk += 1) {
      var kid = vrow.children[vk];
      if (!isVisible(kid)) continue;
      var krect = kid.getBoundingClientRect();
      if (krect.width < VOID_MIN_FLANK_PX || krect.height < VOID_MIN_FLANK_PX) continue;
      vkids.push({ el: kid, left: krect.left, right: krect.right, top: krect.top, bottom: krect.bottom });
    }
    if (vkids.length < 2) continue;
    vkids.sort(function (a, b) { return a.left - b.left; });
    // Widest gap between horizontally-adjacent children that also SHARE A LINE — a wrapped row's
    // "gap" is a line break, not a void.
    var bestGap = 0;
    var bestLeft = null;
    var bestRight = null;
    for (var vg = 1; vg < vkids.length; vg += 1) {
      var prev = vkids[vg - 1];
      var cur = vkids[vg];
      var sameLine = Math.min(prev.bottom, cur.bottom) - Math.max(prev.top, cur.top) > 0;
      if (!sameLine) continue;
      var gap = cur.left - prev.right;
      if (gap > bestGap) { bestGap = gap; bestLeft = prev; bestRight = cur; }
    }
    if (bestLeft === null || bestRight === null) continue;
    if (bestGap < VOID_MIN_PX || bestGap / vrect.width < VOID_MIN_RATIO) continue;
    var leftText = voidFlankText(bestLeft.el);
    if (leftText === "") continue;
    var rightIsControl =
      bestRight.el.matches(INTERACTIVE_SELECTOR) || bestRight.el.querySelector(INTERACTIVE_SELECTOR) !== null;
    if (!rightIsControl) continue;
    rowVoids.push({
      selector: describe(vrow),
      gapPx: Math.round(bestGap),
      rowWidthPx: Math.round(vrect.width),
      gapRatio: Math.round((bestGap / vrect.width) * 100) / 100,
      leftSelector: describe(bestLeft.el),
      leftText: leftText,
      leftWidthPx: Math.round(bestLeft.right - bestLeft.left),
      rightSelector: describe(bestRight.el),
      rightWidthPx: Math.round(bestRight.right - bestRight.left),
    });
  }
  // ── selection idiom: how many ways does one surface say "this one"? ────────
  // "Pick ONE selection idiom. There are currently eight." — an orange left border + tint, a filled
  // bar, a 2px ring, a ring on one button in a box, an underline + tint, a check badge, a SOLID FILLED
  // ACCENT BLOCK, a light fill. Each is defensible alone; together they mean a user re-learns "which one
  // is chosen" per region, and the heaviest treatment lands on the lowest-stakes state.
  //
  // THE GROUPING KEY IS THE PRIMITIVE'S OWN STATE ATTRIBUTE, never a shape guess. This app is built
  // exclusively on Base UI, whose 1.7 docs define a closed state vocabulary (data-checked /
  // data-selected / data-current / data-pressed / data-active, mirrored by the ARIA equivalents the
  // app also authors). So "everything currently expressing selection" is the AUTHOR'S claim, it spans
  // containers — which is exactly what a sibling cohort cannot see — and it is exhaustive rather than
  // heuristic.
  var selectionIdioms = [];
  var SELECT_MIN_ELS = 3;
  var SELECT_RING_MIN_PX = 1;
  var SELECT_BAR_MIN_PX = 2;

  function selectedStateKind(el) {
    if (el.hasAttribute("data-checked") || el.getAttribute("aria-checked") === "true") return "checked";
    if (el.hasAttribute("data-selected") || el.getAttribute("aria-selected") === "true") return "selected";
    var ac = el.getAttribute("aria-current");
    if (el.hasAttribute("data-current") || (ac !== null && ac !== "false")) return "current";
    if (el.hasAttribute("data-pressed")) return "pressed";
    if (el.hasAttribute("data-active")) return "active";
    return null;
  }

  // WHICH CHANNELS CARRY THE SELECTION. Not "what colour" — the idiom is the MECHANISM, and two regions
  // using the same accent through different channels still read as two vocabularies.
  function selectionSignature(el) {
    var st = getComputedStyle(el);
    var channels = [];
    var outline = parseFloat(st.outlineWidth);
    if (!Number.isNaN(outline) && outline >= SELECT_RING_MIN_PX && st.outlineStyle !== "none") channels.push("ring");
    if (st.boxShadow && st.boxShadow !== "none" && st.boxShadow.indexOf("inset") === -1) channels.push("shadow");
    var bg = parseRgb(st.backgroundColor);
    if (bg !== null && bg.a > 0) channels.push("fill");
    var sides = ["Top", "Right", "Bottom", "Left"];
    var thick = [];
    for (var si = 0; si < sides.length; si += 1) {
      var w = parseFloat(st["border" + sides[si] + "Width"]);
      if (!Number.isNaN(w) && w >= SELECT_BAR_MIN_PX) thick.push(sides[si].toLowerCase());
    }
    // A single thick side is a RAIL/UNDERLINE idiom; all four is a boxed idiom. They are different
    // vocabularies and must not collapse into one signature.
    if (thick.length === 1) channels.push("bar-" + thick[0]);
    else if (thick.length > 1) channels.push("border");
    if (st.textDecorationLine && st.textDecorationLine.indexOf("underline") !== -1) channels.push("underline");
    return channels.length === 0 ? "none" : channels.sort().join("+");
  }

  var idiomsByKind = new Map();
  for (var si2 = 0; si2 < allEls.length; si2 += 1) {
    var sel = allEls[si2];
    if (!isVisible(sel)) continue;
    var kind = selectedStateKind(sel);
    if (kind === null) continue;
    var sig = selectionSignature(sel);
    if (sig === "none") continue;
    var bucket = idiomsByKind.get(kind);
    if (bucket === undefined) {
      bucket = new Map();
      idiomsByKind.set(kind, bucket);
    }
    var seen = bucket.get(sig);
    if (seen === undefined) bucket.set(sig, { count: 1, selector: describe(sel) });
    else seen.count += 1;
  }

  idiomsByKind.forEach(function (bucket, kind) {
    var treatments = [];
    var total = 0;
    bucket.forEach(function (v, sig) {
      treatments.push({ signature: sig, count: v.count, selector: v.selector });
      total += v.count;
    });
    if (total < SELECT_MIN_ELS) return;
    treatments.sort(function (a, b) { return b.count - a.count; });
    selectionIdioms.push({
      stateKind: kind,
      elements: total,
      treatments: treatments.length,
      signatures: treatments.map(function (t) { return t.signature + "x" + t.count; }).join(" · "),
      exampleSelector: treatments.length > 1 ? treatments[treatments.length - 1].selector : treatments[0].selector,
    });
  });
`;
