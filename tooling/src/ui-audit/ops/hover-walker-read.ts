// ui-audit in-page segment — the FORCED-STATE pass's second half: glow-member registration, the
// read/restore closures Node drives (`window.__orbHover`), the release-proof verify, and the census
// return object. Split from ops/hover-walker.ts (2026-09-01) when the attribute mechanism took that
// file past the tooling-size cap — the same rule-family segmentation ops/walker.ts runs on. ONE
// function scope with its siblings: ops/hover.ts concatenates STATE_PAINT + HOVER_CENSUS +
// HOVER_DENOMINATOR (ops/hover-walker-groups.ts, the 2026-09-06 half of the same split) + THIS
// segment in order, so every `var` the earlier halves initialized (hoverCandidates, hoverGroups,
// attrGroups, the counters) is live when these lines run — and the ORDER IS LOAD-BEARING rule from
// ops/walker.ts applies unchanged. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
// Mechanism header: ops/hover-walker.ts.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { HOVER_SUBJECT_BUDGET } from "./hover-walker.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const HOVER_FORCE_READ = `
  // ── glow members: state-gated shadow/radial rules ride the SAME forces ───────────────────────
  var glowCandidates = [];
  var glowCandidateSeen = new Map();
  function glowRegister(el, suffix, groupPush) {
    var seen = glowCandidateSeen.get(el);
    if (seen === undefined) { seen = {}; glowCandidateSeen.set(el, seen); }
    if (seen[suffix] === true) return;
    seen[suffix] = true;
    glowCandidates.push({ el: el, suffix: suffix, restSnap: stateGlowSnapshotOf(el) });
    groupPush(glowCandidates.length - 1);
  }
  for (var gi = 0; gi < glowSelectorTexts.length; gi += 1) {
    var gEntry = glowSelectorTexts[gi];
    var gParts = selectorSplitList(gEntry.sel);
    for (var gp = 0; gp < gParts.length; gp += 1) {
      var gOne = gParts[gp].trim();
      if (gOne === "") continue;
      var gComps = selectorCompounds(gOne);
      if (gEntry.hover) {
        if (!hasStateHover(gOne)) continue;
        var gLast = -1;
        for (var gc = 0; gc < gComps.length; gc += 1) {
          if (hasStateHover(gComps[gc].compound)) gLast = gc;
        }
        if (gLast === -1) continue;
        var gPainted = stripStatePseudoElements(stripStateHover(selectorJoin(gComps)));
        var gSubjectSel = stripStatePseudoElements(stripStateHover(selectorJoin(gComps.slice(0, gLast + 1))));
        if (gPainted === "" || gSubjectSel === "") { glowUnresolved += 1; continue; }
        var gEls = null;
        try { gEls = document.querySelectorAll(gPainted); } catch (e) { glowUnresolved += 1; continue; }
        for (var ge = 0; ge < gEls.length; ge += 1) {
          var gel = gEls[ge];
          if (isDevChrome(gel)) continue;
          var gSubject = null;
          try { gSubject = gSubjectSel === gPainted ? gel : gel.closest(gSubjectSel); } catch (e) { glowUnresolved += 1; break; }
          if (gSubject === null || isDevChrome(gSubject)) continue;
          var gGroup = hoverGroupOf(gSubject);
          if (gGroup >= hoverGroups.length) {
            hoverGroups.push({ subjectIndex: gGroup, forced: [], members: [], glowMembers: [] });
            var gClimb = hoverSubjects[gGroup];
            while (gClimb) {
              var gClimbIndex = hoverSubjectIndex.get(gClimb);
              if (gClimbIndex !== undefined) hoverGroups[gGroup].forced.push(gClimbIndex);
              gClimb = gClimb.parentElement;
            }
          }
          if (gGroup >= ${String(HOVER_SUBJECT_BUDGET)}) { glowUnresolved += 1; continue; }
          (function (idx) { glowRegister(gel, ":hover", function (ci) { hoverGroups[idx].glowMembers.push(ci); }); })(gGroup);
        }
      } else {
        var gaLast = -1;
        var gaSpec = null;
        for (var gac = 0; gac < gComps.length; gac += 1) {
          var gaOccs = stateAttrScan(gComps[gac].compound);
          for (var gao = 0; gao < gaOccs.length; gao += 1) {
            if (gaOccs[gao].topLevel && !gaOccs[gao].complex) { gaLast = gac; gaSpec = gaOccs[gao]; }
          }
        }
        if (gaLast === -1) { glowUnresolved += 1; continue; }
        var gaPainted = stripStatePseudoElements(stripStateAttrs(gOne));
        var gaSubjectSel = stripStatePseudoElements(stripStateAttrs(selectorJoin(gComps.slice(0, gaLast + 1))));
        if (gaPainted === "" || gaSubjectSel === "") { glowUnresolved += 1; continue; }
        var gaEls = null;
        try { gaEls = document.querySelectorAll(gaPainted); } catch (e) { glowUnresolved += 1; continue; }
        for (var gae = 0; gae < gaEls.length; gae += 1) {
          var gael = gaEls[gae];
          if (isDevChrome(gael)) continue;
          var gaSubject = null;
          try { gaSubject = gaSubjectSel === gaPainted ? gael : gael.closest(gaSubjectSel); } catch (e) { glowUnresolved += 1; break; }
          if (gaSubject === null || isDevChrome(gaSubject)) continue;
          var gaPrior = gaSubject.getAttribute(gaSpec.attr);
          if (gaPrior !== null && (gaSpec.value === null || gaPrior === gaSpec.value)) continue; // in state at rest: the static glow census owns it
          var gaGroup = attrGroupOf(gaSubject, gaSpec.attr, gaSpec.value);
          if (gaGroup >= ${String(HOVER_SUBJECT_BUDGET)}) { glowUnresolved += 1; continue; }
          (function (idx, suffix) { glowRegister(gael, suffix, function (ci) { attrGroups[idx].glowMembers.push(ci); }); })(gaGroup, attrSuffixOf(gaSpec.attr, gaSpec.value));
        }
      }
    }
  }

  // ── read closures (Node drives these) ────────────────────────────────────
  function hoverMemberRead(idx) {
    var cand = hoverCandidates[idx];
    var forcedStyle = getComputedStyle(cand.el);
    var forcedColor = parseRgb(forcedStyle.color);
    return {
      index: idx,
      color: forcedColor === null ? null : { r: forcedColor.r, g: forcedColor.g, b: forcedColor.b },
      backdrop: resolveBackdrop(cand.el),
      opacity: accumulatedOpacity(cand.el),
    };
  }
  function groupGlowRead(glowMembers) {
    var shadows = [];
    var radials = [];
    for (var gm = 0; gm < glowMembers.length; gm += 1) {
      var gc2 = glowCandidates[glowMembers[gm]];
      var rows = stateGlowRowsOf(gc2.el, gc2.suffix, gc2.restSnap);
      shadows = shadows.concat(rows.shadows);
      radials = radials.concat(rows.radials);
    }
    return { shadows: shadows, radials: radials };
  }
  function hoverRead(gx) {
    var group = hoverGroups[gx];
    var reads = [];
    for (var mi = 0; mi < group.members.length; mi += 1) reads.push(hoverMemberRead(group.members[mi]));
    var glow = groupGlowRead(group.glowMembers);
    return { reads: reads, shadows: glow.shadows, radials: glow.radials };
  }
  /** The in-page ATTRIBUTE force: prior value recorded, state set, members + glows read, prior
   *  restored — one synchronous task, so no framework code can observe the intermediate state. The
   *  inline \`restored\` check catches a same-task failure; the pass-final hoverVerify catches the
   *  microtask-delayed one (a listener re-arming the attribute), which is why BOTH exist. */
  function attrRead(ax) {
    var group = attrGroups[ax];
    var prior = group.el.getAttribute(group.attr);
    var reads = [];
    var glow = { shadows: [], radials: [] };
    group.el.setAttribute(group.attr, group.value === null ? "" : group.value);
    try {
      for (var ami = 0; ami < group.members.length; ami += 1) reads.push(hoverMemberRead(group.members[ami]));
      glow = groupGlowRead(group.glowMembers);
    } finally {
      if (prior === null) group.el.removeAttribute(group.attr);
      else group.el.setAttribute(group.attr, prior);
    }
    return { reads: reads, shadows: glow.shadows, radials: glow.radials, restored: group.el.getAttribute(group.attr) === prior };
  }

  /** Every candidate's REST reading, re-taken after the last release. A single stuck state poisons
   *  every later sample in the run, so this is proven on the live page each run, not only in a
   *  fixture. RETURNS CANDIDATE INDICES, not selectors: the Node side joins these against the same
   *  index space hoverRead emits and hoverRest is built parallel to. Returning selectors here made
   *  Set<string>.has(number) permanently false on the other side, so the withholding branch never ran
   *  while the RESULT line still printed the right count. */
  function hoverVerify() {
    var stuck = [];
    for (var vi = 0; vi < hoverCandidates.length; vi += 1) {
      var vcand = hoverCandidates[vi];
      var vcolor = parseRgb(getComputedStyle(vcand.el).color);
      var vkey = hoverRestKey(vcolor === null ? null : { r: vcolor.r, g: vcolor.g, b: vcolor.b }, resolveBackdrop(vcand.el));
      if (vkey !== vcand.restKey) stuck.push(vi);
    }
    return stuck;
  }

  var hoverRest = [];
  for (var rj = 0; rj < hoverCandidates.length; rj += 1) {
    var rc = hoverCandidates[rj];
    hoverRest.push({
      selector: rc.selector,
      subjectSelector: rc.subjectSelector,
      stateAttr: rc.stateAttr,
      stateAttrValue: rc.stateAttrValue,
      restColor: rc.restColor,
      restBackdrop: rc.restBackdrop,
      fontSizePx: rc.fontSizePx,
      fontWeight: rc.fontWeight,
      inactive: rc.inactive,
      transitionCoversPaint: rc.transitionCoversPaint,
      transitionDurationMs: rc.transitionDurationMs,
    });
  }
  var hoverGroupRows = [];
  for (var gk = 0; gk < hoverGroups.length; gk += 1) {
    hoverGroupRows.push({ forced: hoverGroups[gk].forced, members: hoverGroups[gk].members, glows: hoverGroups[gk].glowMembers.length });
  }
  var attrGroupRows = [];
  for (var agk = 0; agk < attrGroups.length; agk += 1) {
    attrGroupRows.push({ attr: attrGroups[agk].attr, value: attrGroups[agk].value, members: attrGroups[agk].members, glows: attrGroups[agk].glowMembers.length });
  }
  window.__orbHover = { subjects: hoverSubjects, read: hoverRead, readAttr: attrRead, verify: hoverVerify };
  walkObserver.disconnect();
  return {
    rest: hoverRest,
    groups: hoverGroupRows,
    attrGroups: attrGroupRows,
    census: {
      textCandidates: hoverTextCandidates,
      noHoverPaint: hoverNoPaint,
      alreadyInState: hoverAlreadyInState,
      pseudoElementPaint: hoverPseudoPaint,
      complexStateSelector: hoverComplexPaint,
      unresolvableStateSubject: hoverUnresolvedSubject,
      unreadableColor: hoverUnreadableColor,
      overBudget: hoverOverBudget,
      sheetsRead: hoverSheetsRead,
      sheetsUnreadable: hoverSheetsUnreadable,
      hoverRules: hoverRuleCount,
      attrRules: attrRuleCount,
      glowRules: glowRuleCount,
      glowUnresolved: glowUnresolved,
      unparseableSelectors: hoverUnparseable,
      subjects: hoverSubjects.length,
      attrSubjects: attrGroups.length,
    },
  };
`;
