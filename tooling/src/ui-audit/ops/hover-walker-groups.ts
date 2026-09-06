// ui-audit in-page segment — the FORCED-STATE pass's DENOMINATOR and its force GROUPING: every visible
// text-bearing element turned into one candidate per STATE QUESTION, then bucketed into the subject
// groups Node drives. Split from ops/hover-walker.ts (2026-09-06, #1092) when the per-subject hover
// keying took that file past the tooling-size cap — the same rule-family seam ops/hover-walker-read.ts
// came from, and the third segment of ONE function scope: ops/hover.ts concatenates STATE_PAINT +
// HOVER_CENSUS + THIS + HOVER_FORCE_READ in order, so every `var` the pairing half initialized
// (hoverPaintOf, attrPaintOf, the withheld marker maps, the counters) is live when these lines run and
// THE ORDER IS LOAD-BEARING. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
// Design: docs/design/state-paint-census.md; mechanism header: ops/hover-walker.ts.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { INACTIVE_KIND_EXPR } from "../../_shared/wcag.ts";
import { HOVER_SUBJECT_BUDGET } from "./hover-walker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const HOVER_DENOMINATOR = `
  // ── the DENOMINATOR: every visible text-bearing subject, one candidate per STATE QUESTION ────
  // An element painted under both :hover and [data-selected] asks two different questions and gets
  // two candidate rows; an element painted by neither is ONE candidate, excluded(noHoverPaint) —
  // now a true claim about both mechanisms. Elements whose only paint is a withheld shape are ONE
  // candidate under that shape's name.
  var hoverCandidates = [];
  var hoverNoPaint = 0;
  var hoverAlreadyInState = 0;
  var hoverPseudoPaint = 0;
  var hoverComplexPaint = 0;
  var hoverUnresolvedSubject = 0;
  var hoverUnreadableColor = 0;
  var hoverTextCandidates = 0;
  function hoverRestKey(color, backdrop) {
    return JSON.stringify([color, backdrop]);
  }
  /** Does REST's own \`transition-property\` name color/background-color/all with a non-zero matching
   *  \`transition-duration\` — the CSS lists are positional and CYCLE when the counts differ (the spec's
   *  own rule, not a simplification), so property[i] pairs with duration[i % duration.length]. */
  function hoverTransitionInfo(propStr, durStr) {
    var props = propStr.split(",");
    var durs = durStr.split(",");
    var covers = false;
    var maxMs = 0;
    for (var tp = 0; tp < props.length; tp += 1) {
      var name = props[tp].replace(/^\\s+|\\s+$/g, "");
      if (name !== "color" && name !== "background-color" && name !== "all") continue;
      covers = true;
      var durText = durs.length > 0 ? durs[tp % durs.length].replace(/^\\s+|\\s+$/g, "") : "0s";
      var ms = durText.indexOf("ms") === durText.length - 2 ? Number.parseFloat(durText) : Number.parseFloat(durText) * 1000;
      if (!Number.isNaN(ms) && ms > maxMs) maxMs = ms;
    }
    return { covers: covers, ms: covers ? maxMs : 0 };
  }
  for (var ti = 0; ti < allEls.length; ti += 1) {
    var tel = allEls[ti];
    if (!isVisible(tel)) continue;
    if (directTextOf(tel) === "") continue;
    var hoverEntry = hoverPaintOf.get(tel);
    var attrEntry = attrPaintOf.get(tel);
    var isPseudoPainted = pseudoPaintEls.get(tel) === true;
    var isComplexPainted = complexPaintEls.get(tel) === true;
    var isUnresolvedPainted = unresolvedSubjectEls.get(tel) === true;
    if (hoverEntry === undefined && attrEntry === undefined && !isPseudoPainted && !isComplexPainted && !isUnresolvedPainted) {
      hoverTextCandidates += 1;
      hoverNoPaint += 1;
      continue;
    }
    var restStyle = getComputedStyle(tel);
    var restColor = parseRgb(restStyle.color);
    if (restColor === null) { hoverTextCandidates += 1; hoverUnreadableColor += 1; continue; }
    var restBackdrop = resolveBackdrop(tel);
    var fwRest = restStyle.fontWeight;
    var restTransition = hoverTransitionInfo(restStyle.transitionProperty, restStyle.transitionDuration);
    // INACTIVE_KIND_EXPR (interpolated below) is written against an \`el\` binding — the shared
    // spelling every walker call site provides before evaluating it.
    var el = tel;
    var restFacts = {
      restColor: { r: restColor.r, g: restColor.g, b: restColor.b },
      restBackdrop: restBackdrop,
      restKey: hoverRestKey({ r: restColor.r, g: restColor.g, b: restColor.b }, restBackdrop),
      fontSizePx: Number.parseFloat(restStyle.fontSize) || 16,
      fontWeight: fwRest === "bold" ? 700 : fwRest === "normal" ? 400 : Number(fwRest) || 400,
      inactive: ${INACTIVE_KIND_EXPR},
      transitionCoversPaint: restTransition.covers,
      transitionDurationMs: restTransition.ms,
    };
    if (hoverEntry !== undefined) {
      // Synchronous per outer iteration, so the \`tel\`/\`restFacts\` vars this callback closes over are
      // this element's — the forEachPaintedWithKids precedent above.
      hoverEntry.forEach(function (hoverSubject) {
        hoverTextCandidates += 1;
        hoverCandidates.push({
          el: tel,
          subject: hoverSubject,
          stateAttr: null,
          stateAttrValue: null,
          selector: describe(tel),
          subjectSelector: describe(hoverSubject),
          restColor: restFacts.restColor,
          restBackdrop: restFacts.restBackdrop,
          restKey: restFacts.restKey,
          fontSizePx: restFacts.fontSizePx,
          fontWeight: restFacts.fontWeight,
          inactive: restFacts.inactive,
          transitionCoversPaint: restFacts.transitionCoversPaint,
          transitionDurationMs: restFacts.transitionDurationMs,
        });
      });
    }
    if (attrEntry !== undefined) {
      for (var akey in attrEntry) {
        var aState = attrEntry[akey];
        hoverTextCandidates += 1;
        if (aState.already === true) { hoverAlreadyInState += 1; continue; }
        hoverCandidates.push({
          el: tel,
          subject: aState.subject,
          stateAttr: aState.attr,
          stateAttrValue: aState.value,
          selector: describe(tel),
          subjectSelector: describe(aState.subject),
          restColor: restFacts.restColor,
          restBackdrop: restFacts.restBackdrop,
          restKey: restFacts.restKey,
          fontSizePx: restFacts.fontSizePx,
          fontWeight: restFacts.fontWeight,
          inactive: restFacts.inactive,
          transitionCoversPaint: restFacts.transitionCoversPaint,
          transitionDurationMs: restFacts.transitionDurationMs,
        });
      }
    }
    if (isPseudoPainted) { hoverTextCandidates += 1; hoverPseudoPaint += 1; }
    if (isComplexPainted) { hoverTextCandidates += 1; hoverComplexPaint += 1; }
    if (isUnresolvedPainted) { hoverTextCandidates += 1; hoverUnresolvedSubject += 1; }
  }

  // ── grouping: ONE force per subject (per state), all its members read in one evaluate ────────
  var hoverSubjects = [];
  var hoverSubjectIndex = new Map();
  function hoverGroupOf(subject) {
    var known = hoverSubjectIndex.get(subject);
    if (known !== undefined) return known;
    hoverSubjectIndex.set(subject, hoverSubjects.length);
    hoverSubjects.push(subject);
    return hoverSubjects.length - 1;
  }
  var attrGroups = [];
  var attrGroupIndex = new Map();
  function attrGroupOf(subject, attr, value) {
    var perEl = attrGroupIndex.get(subject);
    if (perEl === undefined) { perEl = {}; attrGroupIndex.set(subject, perEl); }
    var key = attrStateKey(attr, value);
    if (perEl[key] !== undefined) return perEl[key];
    attrGroups.push({ el: subject, attr: attr, value: value, members: [], glowMembers: [] });
    perEl[key] = attrGroups.length - 1;
    return perEl[key];
  }
  for (var cm0 = 0; cm0 < hoverCandidates.length; cm0 += 1) {
    if (hoverCandidates[cm0].stateAttr === null) hoverGroupOf(hoverCandidates[cm0].subject);
  }
  var hoverGroups = [];
  for (var sj = 0; sj < hoverSubjects.length; sj += 1) hoverGroups.push({ subjectIndex: sj, forced: [], members: [], glowMembers: [] });
  for (var sk = 0; sk < hoverSubjects.length; sk += 1) {
    // A real pointer sets :hover on the whole ancestor chain; only ancestors that THEMSELVES declare
    // hover paint can change anything, and those are exactly the other subjects.
    var climb = hoverSubjects[sk];
    while (climb) {
      var climbIndex = hoverSubjectIndex.get(climb);
      if (climbIndex !== undefined) hoverGroups[sk].forced.push(climbIndex);
      climb = climb.parentElement;
    }
  }
  var hoverOverBudget = 0;
  for (var cm = 0; cm < hoverCandidates.length; cm += 1) {
    var cand0 = hoverCandidates[cm];
    if (cand0.stateAttr === null) {
      var groupIndex = hoverSubjectIndex.get(cand0.subject);
      if (groupIndex >= ${String(HOVER_SUBJECT_BUDGET)}) { hoverOverBudget += 1; continue; }
      hoverGroups[groupIndex].members.push(cm);
    } else {
      var aGroupIndex = attrGroupOf(cand0.subject, cand0.stateAttr, cand0.stateAttrValue);
      if (aGroupIndex >= ${String(HOVER_SUBJECT_BUDGET)}) { hoverOverBudget += 1; continue; }
      attrGroups[aGroupIndex].members.push(cm);
    }
  }

`;
