// ui-audit in-page segment — the FORCED-STATE census (`:hover` AND Base-UI state attributes),
// read/verify closures included. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
// Composed by ops/hover.ts, NOT by COLLECT_SAMPLES_JS: this pass has a Node-side CDP round trip in
// the middle of it. The shared predicate/vocabulary segment is ops/walker/state-paint.ts; the design
// (mechanisms, classification, polarity) is docs/design/state-paint-census.md.
//
// THE PREFILTER IS THIS FILE'S; the round-trip argument behind it is stated once, in ops/hover.ts's
// header. Keep only rules whose selector carries a `:hover` pseudo (UNESCAPED: Tailwind mints class
// NAMES containing `\\:hover\\:`, and a bare match mangled 19 selectors into unparseable garbage on one
// stage run, #24) or a Base UI state attribute, AND whose block sets `color`/`background-color`.
// Everything else is `excluded(noHoverPaint=…)` — stated, not dropped, and TRUE of both mechanisms.
//
// PAINTED ELEMENT vs STATE SUBJECT — three shapes, one question. `.nav-links a:hover` paints the
// anchor and the anchor is hovered. `.card:hover .label` (and identically `[data-selected] .label`)
// paints the label while an ANCESTOR is in state: the split is at the selector's last state-bearing
// COMPOUND, everything up to it naming the subject. Tailwind's compiled group variant
// `.x:is(:where(.group):hover *)` names its subject INSIDE a functional pseudo, so no compound split
// finds it — ops/walker/group-variant.ts derives that anchor instead (#1084), and refuses by name the
// shapes it cannot. A subject's state background re-backs every text-bearing descendant, so those
// ride along as candidates too.
//
// FORCING IS PER SUBJECT, NOT PER CANDIDATE. `:hover` subjects are held over CDP (one round trip per
// subject chain — ancestors that are themselves hover subjects are forced with it, because a real
// pointer sets `:hover` on the whole chain). ATTRIBUTE subjects are forced IN PAGE — record the prior
// value, setAttribute, read every member synchronously in the SAME task (React/Base UI cannot
// interleave a re-render into a synchronous task), restore the prior value, and assert the restore.
// The pass-final `hoverVerify` then re-reads EVERY candidate's rest key — hover and attribute alike —
// because a reactive listener (a MutationObserver re-arming the attribute) lands in a later microtask
// that the inline restore check cannot see; a stuck state poisons every later sample in the run.
//
// GLOW RIDES THE SAME FORCES. Rules gating `box-shadow`/`text-shadow`/a radial `background-image`
// behind either mechanism register GLOW members on the same subject groups; while a subject is held,
// `stateGlowRowsOf` (state-paint.ts) reads element+pseudo layers and emits ONLY what the state
// CHANGED over the rest snapshot, in the static glow census's own sample shapes.
//
// THE PAINT-LAYER MEMO IS DELIBERATELY WARM. `resolveBackdrop` memoizes the fixed/absolute paint-layer
// census on first use; it is primed here in the rest state and reused under force. A state rule that
// creates or moves a full-page paint layer would be mis-attributed — that is a stated limit, and the
// alternative (re-censusing every paint layer per subject) is the cost this whole design exists to avoid.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { INACTIVE_KIND_EXPR } from "../../_shared/wcag.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

/** How many distinct subjects one run will force, per mechanism. Generous by design: it is a REFUSAL
 *  threshold, not a sampling cap — candidates past it are withheld by name, which makes the run a NO
 *  VERDICT rather than a quietly partial one. Measured live it does not bind (see ops/hover.ts).
 *  Exported for the pass's second half (ops/hover-walker-read.ts), which applies the same threshold
 *  to the glow-only groups it creates. */
export const HOVER_SUBJECT_BUDGET = 240;

export const HOVER_CENSUS = `
  // ── forced-state census: rule collection (both mechanisms, one stylesheet walk) ─────────────
  var hoverSheetsRead = 0;
  var hoverSheetsUnreadable = 0;
  var hoverRuleCount = 0;
  var attrRuleCount = 0;
  var glowRuleCount = 0;
  var glowUnresolved = 0;
  var hoverUnparseable = 0;
  var hoverSelectorTexts = [];
  var attrSelectorTexts = [];
  var glowSelectorTexts = [];
  function hoverCollectRules(rules) {
    for (var hr = 0; hr < rules.length; hr += 1) {
      var rule = rules[hr];
      if (rule.cssRules && rule.cssRules.length > 0) hoverCollectRules(rule.cssRules);
      if (typeof rule.selectorText !== "string") continue;
      if (!rule.style) continue;
      var selHover = hasStateHover(rule.selectorText);
      var selAttr = stateAttrAnywhere(rule.selectorText);
      if (!selHover && !selAttr) continue;
      // A CSSStyleDeclaration read off a RULE expands shorthands, so "background: red" answers here too.
      if (rule.style.color !== "" || rule.style.backgroundColor !== "") {
        if (selHover) { hoverRuleCount += 1; hoverSelectorTexts.push(rule.selectorText); }
        else { attrRuleCount += 1; attrSelectorTexts.push(rule.selectorText); }
      }
      if (rule.style.boxShadow !== "" || rule.style.textShadow !== "" || (rule.style.backgroundImage || "").indexOf("radial-gradient") !== -1) {
        glowRuleCount += 1;
        glowSelectorTexts.push({ sel: rule.selectorText, hover: selHover });
      }
    }
  }
  for (var hs = 0; hs < document.styleSheets.length; hs += 1) {
    try {
      var sheetRules = document.styleSheets[hs].cssRules;
      hoverSheetsRead += 1;
      hoverCollectRules(sheetRules);
    } catch (hoverSheetError) {
      hoverSheetsUnreadable += 1;
    }
  }

  // ── pair building ────────────────────────────────────────────────────────
  // element -> its hover subjects, keyed BY SUBJECT; element -> per state-attribute subject, keyed by
  // STATE. The withheld classes (pseudo-element paint, functional-pseudo state, unresolvable subject)
  // mark hosts + descendants so the candidate loop can NAME them instead of filing a false
  // noHoverPaint exclusion.
  //
  // ONE QUESTION PER REACHABLE STATE, ON BOTH MECHANISMS (#1092). This map used to hold ONE subject per
  // element, deepest-wins — so \`.row:hover .label\` and \`.card:hover .label\` (an ancestor pair) collapsed
  // to a single candidate under \`.card\`, and the state a pointer produces inside \`.row\` but outside
  // \`.card\` was never asked. Both states are reachable and they paint differently, which is exactly the
  // definition the attribute side already used when it keyed by state. Deepest-wins was not a
  // de-duplicator either: distinct subjects are distinct FORCES (a group's chain climb holds its own
  // subject ancestors, so the deep group answers "both hovered" and the shallow group answers "only the
  // outer one"), and identical (element, subject) pairs from two rules still collapse — the map key is
  // the subject ELEMENT.
  var hoverPaintOf = new Map();
  var attrPaintOf = new Map();
  var pseudoPaintEls = new Map();
  var complexPaintEls = new Map();
  var unresolvedSubjectEls = new Map();
  function hoverConsider(el, subject) {
    var entry = hoverPaintOf.get(el);
    if (entry === undefined) { entry = new Map(); hoverPaintOf.set(el, entry); }
    if (!entry.has(subject)) entry.set(subject, subject);
  }
  function forEachPaintedWithKids(pel, mark) {
    mark(pel);
    if (!pel.querySelectorAll) return;
    var kids = pel.querySelectorAll("*");
    for (var kk = 0; kk < kids.length; kk += 1) mark(kids[kk]);
  }
  function markStateHosts(sel, map) {
    var hosts = null;
    try { hosts = document.querySelectorAll(sel); } catch (e) { hoverUnparseable += 1; return; }
    for (var mh = 0; mh < hosts.length; mh += 1) {
      if (isDevChrome(hosts[mh])) continue;
      forEachPaintedWithKids(hosts[mh], function (el) { map.set(el, true); });
    }
  }
  function attrStateKey(attr, value) { return attr + "\\u0000" + (value === null ? "" : "=" + value); }
  function attrSuffixOf(attr, value) { return "[" + attr + (value === null ? "" : "=" + JSON.stringify(value)) + "]"; }
  function attrConsider(el, subject, attr, value, already) {
    var entry = attrPaintOf.get(el);
    if (entry === undefined) { entry = {}; attrPaintOf.set(el, entry); }
    var key = attrStateKey(attr, value);
    var prior = entry[key];
    if (prior === undefined || prior.subject.contains(subject)) entry[key] = { subject: subject, attr: attr, value: value, already: already };
  }

  // :hover pairs — the original mechanism, now escape-aware end to end.
  var hoverPairs = [];
  var hoverPairSeen = {};
  for (var hi = 0; hi < hoverSelectorTexts.length; hi += 1) {
    var listParts = selectorSplitList(hoverSelectorTexts[hi]);
    for (var lp = 0; lp < listParts.length; lp += 1) {
      var one = listParts[lp].trim();
      if (one === "" || !hasStateHover(one)) continue;
      var comps = selectorCompounds(one);
      var lastHover = -1;
      var anyNestedHover = false;
      for (var cj = 0; cj < comps.length; cj += 1) {
        var hoverAt = stateHoverScan(comps[cj].compound);
        if (hoverAt.topLevel) lastHover = cj;
        if (hoverAt.nested) anyNestedHover = true;
      }
      if (lastHover === -1) {
        // Every \`:hover\` here is nested in a functional pseudo — the compiled group variant, whose
        // subject is an ANCESTOR (#1073 stopped forcing the painted element; #1084 resolves the anchor
        // and forces THAT). ops/walker/group-variant.ts owns the derivation and the refusals.
        var gvHover = anyNestedHover ? groupVariantPairOf(one) : null;
        if (gvHover === null) continue;
        if (gvHover.kind === "pseudo") { markStateHosts(gvHover.hostSel, pseudoPaintEls); continue; }
        if (gvHover.kind === "opaque") { markStateHosts(gvHover.hostSel, complexPaintEls); continue; }
        var gvKey = gvHover.subjectSel + " <<>> " + gvHover.paintedSel;
        if (hoverPairSeen[gvKey] !== true) {
          hoverPairSeen[gvKey] = true;
          hoverPairs.push({ paintedSel: gvHover.paintedSel, subjectSel: gvHover.subjectSel });
        }
        continue;
      }
      var paintedSel = stripStateHover(selectorJoin(comps));
      // A pseudo-ELEMENT paint target (.x:hover::before) cannot be judged: resolveBackdrop reads
      // ancestors only, so the pair would be measured against a backdrop the pseudo may replace.
      // WITHHELD by name (hosts marked below), never silently unparseable, never wrongly judged.
      if (hasStatePseudoElement(paintedSel)) {
        var hoverHostSel = stripStatePseudoElements(paintedSel);
        if (hoverHostSel !== "") markStateHosts(hoverHostSel, pseudoPaintEls);
        continue;
      }
      var subjectSel = stripStateHover(selectorJoin(comps.slice(0, lastHover + 1)));
      if (paintedSel === "" || subjectSel === "") continue;
      var pairKey = subjectSel + " <<>> " + paintedSel;
      if (hoverPairSeen[pairKey] === true) continue;
      hoverPairSeen[pairKey] = true;
      hoverPairs.push({ paintedSel: paintedSel, subjectSel: subjectSel });
    }
  }
  for (var pi2 = 0; pi2 < hoverPairs.length; pi2 += 1) {
    var pair = hoverPairs[pi2];
    var paintedEls = null;
    try {
      paintedEls = document.querySelectorAll(pair.paintedSel);
    } catch (hoverPaintedError) {
      hoverUnparseable += 1;
      continue;
    }
    for (var pk = 0; pk < paintedEls.length; pk += 1) {
      var pel2 = paintedEls[pk];
      if (isDevChrome(pel2)) continue;
      var subjectEl = null;
      try {
        subjectEl = pair.subjectSel === pair.paintedSel ? pel2 : pel2.closest(pair.subjectSel);
      } catch (hoverSubjectError) {
        hoverUnparseable += 1;
        break;
      }
      if (subjectEl === null || isDevChrome(subjectEl)) continue;
      forEachPaintedWithKids(pel2, function (el) { hoverConsider(el, subjectEl); });
    }
  }

  // state-attribute pairs — the Base UI mechanism.
  var attrPairSeen = {};
  for (var ai = 0; ai < attrSelectorTexts.length; ai += 1) {
    var aParts = selectorSplitList(attrSelectorTexts[ai]);
    for (var ap = 0; ap < aParts.length; ap += 1) {
      var aOne = aParts[ap].trim();
      if (aOne === "") continue;
      var aComps = selectorCompounds(aOne);
      var lastAttr = -1;
      var attrSpec = null;
      var anyComplexOperator = false;
      var nestedSpec = null;
      for (var ac = 0; ac < aComps.length; ac += 1) {
        var occs = stateAttrScan(aComps[ac].compound);
        for (var ao = 0; ao < occs.length; ao += 1) {
          if (occs[ao].complex) anyComplexOperator = true;
          else if (occs[ao].topLevel) { lastAttr = ac; attrSpec = occs[ao]; }
          else nestedSpec = occs[ao];
        }
      }
      var aPaintedSel = "";
      var aSubjectSel = "";
      if (lastAttr === -1) {
        // No forcible state test on the compound itself: either the compiled group variant, whose
        // anchor ops/walker/group-variant.ts resolves (#1084), or a shape it refuses to model — a
        // non-\`=\` operator included, which stays withheld because the forcer cannot produce it.
        var gvAttr = groupVariantPairOf(aOne);
        if (gvAttr === null || gvAttr.kind !== "pair" || anyComplexOperator || nestedSpec === null) {
          if (gvAttr !== null) markStateHosts(gvAttr.hostSel, gvAttr.kind === "pseudo" ? pseudoPaintEls : complexPaintEls);
          continue;
        }
        attrSpec = nestedSpec;
        aPaintedSel = gvAttr.paintedSel;
        aSubjectSel = gvAttr.subjectSel;
      } else {
        aPaintedSel = stripStateAttrs(aOne);
        if (hasStatePseudoElement(aPaintedSel)) {
          var attrHostSel = stripStatePseudoElements(aPaintedSel);
          if (attrHostSel !== "") markStateHosts(attrHostSel, pseudoPaintEls);
          continue;
        }
        aSubjectSel = stripStateAttrs(selectorJoin(aComps.slice(0, lastAttr + 1)));
        if (aPaintedSel === "" || aSubjectSel === "") {
          // A bare-attribute compound ([data-selected] .label) has no rest-resolvable subject.
          var bareHostSel = aPaintedSel !== "" ? aPaintedSel : null;
          if (bareHostSel !== null) markStateHosts(bareHostSel, unresolvedSubjectEls);
          continue;
        }
      }
      var aKey = aSubjectSel + " <<>> " + aPaintedSel + " <<>> " + attrStateKey(attrSpec.attr, attrSpec.value);
      if (attrPairSeen[aKey] === true) continue;
      attrPairSeen[aKey] = true;
      var aPainted = null;
      try {
        aPainted = document.querySelectorAll(aPaintedSel);
      } catch (attrPaintedError) {
        hoverUnparseable += 1;
        continue;
      }
      for (var apk = 0; apk < aPainted.length; apk += 1) {
        var apel = aPainted[apk];
        if (isDevChrome(apel)) continue;
        var aSubjectEl = null;
        try {
          aSubjectEl = aSubjectSel === aPaintedSel ? apel : apel.closest(aSubjectSel);
        } catch (attrSubjectError) {
          hoverUnparseable += 1;
          break;
        }
        if (aSubjectEl === null || isDevChrome(aSubjectEl)) continue;
        var aPrior = aSubjectEl.getAttribute(attrSpec.attr);
        var aAlready = aPrior !== null && (attrSpec.value === null || aPrior === attrSpec.value);
        (function (subj, spec, already) {
          forEachPaintedWithKids(apel, function (el) { attrConsider(el, subj, spec.attr, spec.value, already); });
        })(aSubjectEl, attrSpec, aAlready);
      }
    }
  }

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
