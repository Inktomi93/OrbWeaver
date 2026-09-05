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

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_COHORT = `  // ── sibling cohort anatomy ────────────────────────────────────────────────
  var cohortAnatomies = [];
  relationalAccounting["cohort-anatomy"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  relationalAccounting["row-void"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  relationalAccounting["pane-ink"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };

  // A WITHHELD COUNT WITHOUT A SUBJECT IS UNACTIONABLE (#1704). The relational censuses recorded only a
  // TALLY, so \`selection-idiom: unmatchedUnselected=2\` told a reader that two cohorts held the whole
  // surface at population-verdict=NO-VERDICT and gave no way to find either — three design-audit passes on
  // Characters across a week (08-30, 09-02, 09-05) all ended on that string, and the printed remedy could
  // not be tested against the cohorts because nobody could name them. Every site now hands the walker's own
  // \`describe()\` of a representative carrier, so the refusal says WHAT it could not judge.
  //
  // BOUNDED AND DEDUPED, and OUTSIDE the settlement arithmetic (the \`carried\` precedent): a subject list is
  // evidence about the tally, never a second disposition, so it cannot make the numbers stop settling. Three
  // is a REPRESENTATIVE bound — a reader chasing a NO-VERDICT needs a place to look, not a full census — and
  // the COUNT beside it is the complete number.
  var WITHHELD_SUBJECT_CAP = 3;
  function withholdRelational(accounting, reason, subject) {
    accounting.withheld[reason] = (accounting.withheld[reason] || 0) + 1;
    if (!accounting.withheldSubjects) accounting.withheldSubjects = {};
    var subjects = accounting.withheldSubjects[reason];
    if (subjects === undefined) {
      subjects = [];
      accounting.withheldSubjects[reason] = subjects;
    }
    if (subjects.length < WITHHELD_SUBJECT_CAP && subjects.indexOf(subject) === -1) subjects.push(subject);
  }

  function excludeRelational(accounting, reason) {
    accounting.excluded[reason] = (accounting.excluded[reason] || 0) + 1;
  }

  // A TAG OVER CANDIDATES, NEVER A DISPOSITION (#1172). Some censuses reach a subject through more than one
  // route — an element, or the same element's ::before — and the routes have different blindnesses. This
  // says HOW MANY candidates arrived by a named non-default route, so a cohort cannot enter (or leave) a
  // denominator invisibly; judged/withheld/excluded still account for every one of them exactly once.
  function carryRelational(accounting, label) {
    if (!accounting.carried) accounting.carried = {};
    accounting.carried[label] = (accounting.carried[label] || 0) + 1;
  }

  // Two members prove nothing: a pair that differs is as likely a header-plus-row as a defect. Three is
  // the smallest population where "most of them agree and one does not" is a statement.
  var COHORT_MIN_MEMBERS = 3;
  // Sub-4px boxes are plumbing (sr-only stubs, spacers); their height carries no anatomy.
  var COHORT_MIN_PAINTED_PX = 4;
  // How much of a box difference the CONTENT difference must explain before the row counts as sized by
  // what it holds rather than mis-sized. 0.8 leaves room for a member's own padding without letting a
  // row whose content matches its siblings' escape on rounding.
  var CONTENT_EXPLAINS_RATIO = 0.8;

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
    var canim =
      typeof cel.getAnimations === "function" &&
      cel.getAnimations().some(function (animation) { return animation.playState === "running" || animation.playState === "pending"; });
    // A ROW SIZED BY ITS OWN CONTENT IS NOT A DEFECT (repaired after the first live run). On
    // settings:appearance this rule flagged a setting-row cohort at 234 / 53 / 34px — but the 234px
    // member holds a three-card theme picker and the 34px one holds a button, so the markup is right and
    // the heights SHOULD differ. Half the findings on that surface were this shape.
    //
    // The discriminator is the tallest CHILD: when a member's height is explained by what it contains,
    // its box is doing its job. A defect is a member whose content is the same size as its siblings' and
    // whose BOX still differs — the F1 case, where 16px and 32px rows hold identical content.
    var tallestChild = 0;
    for (var cc = 0; cc < cel.children.length; cc += 1) {
      var childRect = cel.children[cc].getBoundingClientRect();
      if (childRect.height > tallestChild) tallestChild = childRect.height;
    }
    // AN INLINE TEXT RUN HAS NO BOX OF ITS OWN (#1703). \`getBoundingClientRect\` on a \`display: inline\`
    // element returns the UNION of its line boxes, so its "height" is a LINE-WRAP COUNT — a function of the
    // viewport, not of anything the author sized. Measured live: one \`span[data-slot=dialogue]\` cohort (the
    // quoted-speech runs @orb/ui's markdown emits, packages/ui/src/markdown/dialogue-paragraph.tsx:54,71)
    // reported three DIFFERENT majority/minority splits for the same markup across three arms — 69/45px
    // desktop, 45/21px Light, 21/45px mobile-coarse. The rule's own premise ("the markup claims they are
    // the same kind of row and the pixels disagree") does not hold for prose: the pixels are the prose
    // reflowing, and the finding inverts between arms.
    //
    // Read the computed display rather than \`getClientRects().length > 1\`: a SINGLE-line inline run is
    // equally unmeasurable (its height is the line box's), and the wrap count is exactly the thing that
    // must not decide whether the rule can see a cohort. \`inline-block\`/\`inline-flex\` DO own a box and stay
    // judged — this is a mechanism fence on "has no box", not on the word "inline".
    var cdisplay = getComputedStyle(cel).display;
    members.push({ el: cel, height: Math.round(crect.height), content: Math.round(tallestChild), animating: canim, inlineRun: cdisplay === "inline" });
  }

  cohortsByParent.forEach(function (byKey, parentEl) {
    byKey.forEach(function (members, key) {
      if (members.length < COHORT_MIN_MEMBERS) return;
      relationalAccounting["cohort-anatomy"].candidates += 1;
      var animating = false;
      var allInline = true;
      var heights = [];
      for (var mi = 0; mi < members.length; mi += 1) {
        if (members[mi].animating) animating = true;
        if (!members[mi].inlineRun) allInline = false;
        heights.push(members[mi].height);
      }
      // EXCLUDED, not dropped (#1703): the cohort is still a candidate and still prints, so widening this
      // fence is visible in the denominator instead of arriving as a quieter clean run. A cohort whose
      // members are ALL boxless prose runs has no comparable anatomy at all; a MIXED cohort keeps being
      // judged, because one member of a component rendering inline while its siblings render as boxes is a
      // real divergence and is exactly what this rule exists to say.
      if (allInline) {
        excludeRelational(relationalAccounting["cohort-anatomy"], "inlineTextRun");
        return;
      }
      if (animating) {
        withholdRelational(relationalAccounting["cohort-anatomy"], "animating", describe(parentEl));
        return;
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
      // The mode member's own content height is the reference: an outlier whose CONTENT also grew is a
      // row doing its job, and only one whose content matches the mode while its BOX does not is a
      // defect. Without this the rule reported a 234px theme-picker row against its 34px button sibling.
      var modeContent = 0;
      for (var mc = 0; mc < members.length; mc += 1) {
        if (members[mc].height === modeHeight) { modeContent = members[mc].content; break; }
      }
      var outlier = null;
      var outlierCount = 0;
      var contentDriven = 0;
      for (var oi = 0; oi < members.length; oi += 1) {
        if (members[oi].height === modeHeight) continue;
        var boxDelta = Math.abs(members[oi].height - modeHeight);
        var contentDelta = Math.abs(members[oi].content - modeContent);
        // Most of the box difference explained by the content difference ⇒ the content sized the row.
        if (contentDelta >= boxDelta * CONTENT_EXPLAINS_RATIO) { contentDriven += 1; continue; }
        outlierCount += 1;
        if (outlier === null) outlier = members[oi];
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
      relationalAccounting["cohort-anatomy"].judged += 1;
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
  var VOID_MIN_FLANK_PX = 4;

  function voidFlankText(el) {
    // \\s, not \\\\s: this is a TEMPLATE LITERAL, so a single backslash is consumed as an escape and
    // the emitted regex becomes /s+/g — which silently replaces the LETTER s. Caught by a fixture
    // reading back "Avatar  hape"; every sibling census writes it the same way for the same reason.
    var t = (el.textContent || "").replace(/\\s+/g, " ").trim();
    return t.length > 40 ? t.slice(0, 40) : t;
  }

  function boundVoidControl(leftEl, rightEl) {
    var control = rightEl.matches(INTERACTIVE_SELECTOR) ? rightEl : rightEl.querySelector(INTERACTIVE_SELECTOR);
    if (control === null) return null;
    var labelledBy = String(control.getAttribute("aria-labelledby") || "").trim().split(/\\s+/);
    var labelCandidates = [];
    if (leftEl.matches("label[for]")) labelCandidates.push(leftEl);
    var nestedLabels = leftEl.querySelectorAll("label[for]");
    for (var vl = 0; vl < nestedLabels.length; vl += 1) labelCandidates.push(nestedLabels[vl]);
    for (var lc = 0; lc < labelCandidates.length; lc += 1) {
      var targetId = String(labelCandidates[lc].getAttribute("for") || "");
      var target = targetId === "" ? null : document.getElementById(targetId);
      if (target === control || (target !== null && rightEl.contains(target))) return control;
    }
    var leftIds = [];
    if (leftEl.id) leftIds.push(leftEl.id);
    var identified = leftEl.querySelectorAll("[id]");
    for (var ii = 0; ii < identified.length; ii += 1) leftIds.push(identified[ii].id);
    for (var lid = 0; lid < leftIds.length; lid += 1) {
      if (labelledBy.indexOf(leftIds[lid]) !== -1) return control;
    }
    return null;
  }

  for (var vi = 0; vi < allEls.length; vi += 1) {
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
    var leftText = voidFlankText(bestLeft.el);
    if (leftText === "") continue;
    var rightIsControl = bestRight.el.matches(INTERACTIVE_SELECTOR) || bestRight.el.querySelector(INTERACTIVE_SELECTOR) !== null;
    if (!rightIsControl) continue;
    relationalAccounting["row-void"].candidates += 1;
    if (boundVoidControl(bestLeft.el, bestRight.el) === null) {
      excludeRelational(relationalAccounting["row-void"], "unbound");
      continue;
    }
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
    relationalAccounting["row-void"].judged += 1;
  }
`;
