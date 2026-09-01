// ui-audit in-page segment — the FORCED-STATE (`:hover`) census, read/verify closures included.
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts. Composed by ops/hover.ts, NOT by
// COLLECT_SAMPLES_JS: this segment runs in its own evaluation because the pass it belongs to has a
// Node-side CDP round trip in the middle of it.
//
// THE POPULATION ARGUMENT LIVES HERE, because this is the code that bounds it. Forcing `:hover` on every
// interactive element would be one CDP round trip per element (117 controls on `settings:appearance`),
// and most of them declare no hover paint at all. So the narrowing is done FIRST, in page JS, at zero
// round-trip cost: enumerate the stylesheets, keep only the rules whose selector carries a `:hover`
// compound AND whose declaration block sets `color`/`background-color`, and resolve those selectors to
// elements. Everything else is `excluded(noHoverPaint=…)` — stated, not dropped.
//
// PAINTED ELEMENT vs HOVER SUBJECT. `.nav-links a:hover` paints the anchor and the anchor is hovered;
// `.card:hover .label` paints the label while the CARD is hovered. The segment splits each selector at
// its last `:hover` compound: everything up to it names the SUBJECT to force, the whole selector with
// `:hover` stripped names what gets PAINTED. A subject's hover background also re-backs every
// text-bearing descendant, so those ride along as candidates too — that is the "hover background moves,
// label colour does not" half of the defect, which a self-hover-only census is structurally blind to.
//
// FORCING IS PER SUBJECT, NOT PER CANDIDATE. Candidates are grouped by subject and every member of a
// group is read in ONE evaluate while that subject is forced, so the round-trip count is the number of
// distinct hover subjects, not the number of texts. A subject's ANCESTORS that are themselves hover
// subjects are forced with it, because a real pointer sets `:hover` on the whole ancestor chain.
//
// THE PAINT-LAYER MEMO IS DELIBERATELY WARM. `resolveBackdrop` memoizes the fixed/absolute paint-layer
// census on first use; it is primed here in the rest state and reused under force. A hover rule that
// creates or moves a full-page paint layer would be mis-attributed — that is a stated limit, and the
// alternative (re-censusing every paint layer per subject) is the cost this whole design exists to avoid.
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { INACTIVE_KIND_EXPR } from "../../_shared/wcag.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

/** How many distinct hover subjects one run will force. Generous by design: it is a REFUSAL threshold,
 *  not a sampling cap — candidates past it are withheld by name, which makes the run a NO VERDICT rather
 *  than a quietly partial one. Measured live it does not bind (see ops/hover.ts). */
const HOVER_SUBJECT_BUDGET = 240;

export const HOVER_CENSUS = `
  // ── forced-state (:hover) census ─────────────────────────────────────────
  var HOVER_PSEUDO_RE = /:hover(?![-\\w])/gi;
  var hoverSheetsRead = 0;
  var hoverSheetsUnreadable = 0;
  var hoverRuleCount = 0;
  var hoverUnparseable = 0;
  var hoverSelectorTexts = [];
  function hoverCollectRules(rules) {
    for (var hr = 0; hr < rules.length; hr += 1) {
      var rule = rules[hr];
      if (rule.cssRules && rule.cssRules.length > 0) hoverCollectRules(rule.cssRules);
      if (typeof rule.selectorText !== "string") continue;
      if (rule.selectorText.indexOf(":hover") === -1) continue;
      if (!rule.style) continue;
      // A CSSStyleDeclaration read off a RULE expands shorthands, so "background: red" answers here too.
      if (rule.style.color === "" && rule.style.backgroundColor === "") continue;
      hoverRuleCount += 1;
      hoverSelectorTexts.push(rule.selectorText);
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

  /** Split at top-level commas only — a comma inside :is(a, b) belongs to the pseudo, not to the list. */
  function hoverSplitList(text) {
    var parts = [];
    var depth = 0;
    var quote = "";
    var buf = "";
    for (var si = 0; si < text.length; si += 1) {
      var ch = text.charAt(si);
      if (quote !== "") {
        buf += ch;
        if (ch === quote && text.charAt(si - 1) !== "\\\\") quote = "";
        continue;
      }
      if (ch === "'" || ch === '"') { quote = ch; buf += ch; continue; }
      if (ch === "(" || ch === "[") depth += 1;
      if (ch === ")" || ch === "]") depth -= 1;
      if (depth === 0 && ch === ",") { parts.push(buf); buf = ""; continue; }
      buf += ch;
    }
    parts.push(buf);
    return parts;
  }

  /** One complex selector to its top-level compounds, each with the combinator that precedes it. */
  function hoverCompounds(sel) {
    var out = [];
    var depth = 0;
    var quote = "";
    var buf = "";
    var comb = "";
    var pendingSpace = false;
    for (var ci = 0; ci < sel.length; ci += 1) {
      var c = sel.charAt(ci);
      if (quote !== "") {
        buf += c;
        if (c === quote && sel.charAt(ci - 1) !== "\\\\") quote = "";
        continue;
      }
      if (c === "'" || c === '"') { quote = c; buf += c; continue; }
      if (c === "(" || c === "[") { depth += 1; buf += c; continue; }
      if (c === ")" || c === "]") { depth -= 1; buf += c; continue; }
      if (depth > 0) { buf += c; continue; }
      if (c === " " || c === "\\t" || c === "\\n" || c === "\\r") {
        if (buf !== "") pendingSpace = true;
        continue;
      }
      if (c === ">" || c === "+" || c === "~") {
        if (buf !== "") { out.push({ combinator: comb, compound: buf }); buf = ""; }
        comb = c;
        pendingSpace = false;
        continue;
      }
      if (pendingSpace && buf !== "") { out.push({ combinator: comb, compound: buf }); buf = ""; comb = " "; }
      pendingSpace = false;
      buf += c;
    }
    if (buf !== "") out.push({ combinator: comb, compound: buf });
    return out;
  }

  function hoverJoin(parts) {
    var s = "";
    for (var ji = 0; ji < parts.length; ji += 1) {
      var step = parts[ji];
      if (ji === 0) s += step.compound;
      else if (step.combinator === " " || step.combinator === "") s += " " + step.compound;
      else s += " " + step.combinator + " " + step.compound;
    }
    return s;
  }

  function hoverStrip(sel) {
    return sel.replace(HOVER_PSEUDO_RE, "").trim();
  }

  var hoverPairs = [];
  var hoverPairSeen = {};
  for (var hi = 0; hi < hoverSelectorTexts.length; hi += 1) {
    var listParts = hoverSplitList(hoverSelectorTexts[hi]);
    for (var lp = 0; lp < listParts.length; lp += 1) {
      var one = listParts[lp].trim();
      if (one === "" || one.indexOf(":hover") === -1) continue;
      var comps = hoverCompounds(one);
      var lastHover = -1;
      for (var cj = 0; cj < comps.length; cj += 1) {
        if (comps[cj].compound.indexOf(":hover") !== -1) lastHover = cj;
      }
      if (lastHover === -1) continue;
      var paintedSel = hoverStrip(hoverJoin(comps));
      var subjectSel = hoverStrip(hoverJoin(comps.slice(0, lastHover + 1)));
      if (paintedSel === "" || subjectSel === "") continue;
      var pairKey = subjectSel + " <<>> " + paintedSel;
      if (hoverPairSeen[pairKey] === true) continue;
      hoverPairSeen[pairKey] = true;
      hoverPairs.push({ paintedSel: paintedSel, subjectSel: subjectSel });
    }
  }

  // element -> the DEEPEST hover subject that repaints it. Deepest wins because that is the rule a
  // reader will go looking for; its hover-subject ancestors are forced alongside it below.
  var hoverPaintOf = new Map();
  function hoverConsider(el, subject) {
    var prior = hoverPaintOf.get(el);
    if (prior === undefined || prior.contains(subject)) hoverPaintOf.set(el, subject);
  }
  function hoverRegisterPainted(pel, subject) {
    hoverConsider(pel, subject);
    if (!pel.querySelectorAll) return;
    var kids = pel.querySelectorAll("*");
    for (var kk = 0; kk < kids.length; kk += 1) hoverConsider(kids[kk], subject);
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
      hoverRegisterPainted(pel2, subjectEl);
    }
  }

  // The DENOMINATOR: every visible text-bearing subject the walk accepted — the same base population the
  // reading-surface rules judge, so "excluded(noHoverPaint=N)" is a statement about this surface's texts.
  var hoverCandidates = [];
  var hoverNoPaint = 0;
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
    hoverTextCandidates += 1;
    var subjectForText = hoverPaintOf.get(tel);
    if (subjectForText === undefined) { hoverNoPaint += 1; continue; }
    var restStyle = getComputedStyle(tel);
    var restColor = parseRgb(restStyle.color);
    if (restColor === null) { hoverUnreadableColor += 1; continue; }
    var restBackdrop = resolveBackdrop(tel);
    var fwRest = restStyle.fontWeight;
    var el = tel;
    var restTransition = hoverTransitionInfo(restStyle.transitionProperty, restStyle.transitionDuration);
    hoverCandidates.push({
      el: tel,
      subject: subjectForText,
      selector: describe(tel),
      subjectSelector: describe(subjectForText),
      restColor: { r: restColor.r, g: restColor.g, b: restColor.b },
      restBackdrop: restBackdrop,
      restKey: hoverRestKey({ r: restColor.r, g: restColor.g, b: restColor.b }, restBackdrop),
      fontSizePx: Number.parseFloat(restStyle.fontSize) || 16,
      fontWeight: fwRest === "bold" ? 700 : fwRest === "normal" ? 400 : Number(fwRest) || 400,
      inactive: ${INACTIVE_KIND_EXPR},
      transitionCoversPaint: restTransition.covers,
      transitionDurationMs: restTransition.ms,
    });
  }

  // Group by subject: ONE force per subject, all its texts read in one evaluate.
  var hoverSubjects = [];
  var hoverSubjectIndex = new Map();
  for (var gi2 = 0; gi2 < hoverCandidates.length; gi2 += 1) {
    var gsub = hoverCandidates[gi2].subject;
    if (hoverSubjectIndex.has(gsub)) continue;
    hoverSubjectIndex.set(gsub, hoverSubjects.length);
    hoverSubjects.push(gsub);
  }
  var hoverGroups = [];
  for (var sj = 0; sj < hoverSubjects.length; sj += 1) hoverGroups.push({ subjectIndex: sj, forced: [], members: [] });
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
    var groupIndex = hoverSubjectIndex.get(hoverCandidates[cm].subject);
    if (groupIndex >= ${String(HOVER_SUBJECT_BUDGET)}) { hoverOverBudget += 1; continue; }
    hoverGroups[groupIndex].members.push(cm);
  }

  function hoverRead(gx) {
    var group = hoverGroups[gx];
    var out = [];
    for (var mi = 0; mi < group.members.length; mi += 1) {
      var idx = group.members[mi];
      var cand = hoverCandidates[idx];
      var hoverStyle = getComputedStyle(cand.el);
      var hoverColor = parseRgb(hoverStyle.color);
      out.push({
        index: idx,
        color: hoverColor === null ? null : { r: hoverColor.r, g: hoverColor.g, b: hoverColor.b },
        backdrop: resolveBackdrop(cand.el),
        opacity: accumulatedOpacity(cand.el),
      });
    }
    return out;
  }

  /** Every candidate's REST reading, re-taken after the last release. A single stuck :hover poisons every
   *  later sample in the run, so this is proven on the live page each run, not only in a fixture.
   *  RETURNS CANDIDATE INDICES, not selectors: the Node side joins these against the same index space
   *  hoverRead emits and hoverRest is built parallel to. Returning selectors here made
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
    hoverGroupRows.push({ forced: hoverGroups[gk].forced, members: hoverGroups[gk].members });
  }
  window.__orbHover = { subjects: hoverSubjects, read: hoverRead, verify: hoverVerify };
  walkObserver.disconnect();
  return {
    rest: hoverRest,
    groups: hoverGroupRows,
    census: {
      textCandidates: hoverTextCandidates,
      noHoverPaint: hoverNoPaint,
      unreadableColor: hoverUnreadableColor,
      overBudget: hoverOverBudget,
      sheetsRead: hoverSheetsRead,
      sheetsUnreadable: hoverSheetsUnreadable,
      hoverRules: hoverRuleCount,
      unparseableSelectors: hoverUnparseable,
      subjects: hoverSubjects.length,
    },
  };
`;
