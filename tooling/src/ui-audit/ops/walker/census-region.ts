// ui-audit in-page walker — segment: REGION-SCOPED relational facts.
//
// Sibling cohorts (census-cohort.ts) answer "do these things agree with each other". This segment answers
// three questions about a REGION and about the surface as a whole, none of which any element can answer
// alone:
//
//   pane ink      — does this region earn the height the shell gave it?
//   quiet state   — is the OFF state louder than the ON state?
//   empty states  — how many panes of one surface are simultaneously empty?
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_CENSUS_REGION = `  // ── pane ink: a region that does not earn its height ──────────────────────
  // "The panes are 60-90% empty and nothing designed lives in the void. Personas: content ends y=347 of
  // 1400. The teacher: 4 lines in a 700px column. Not 'clean' — UNFINISHED-LOOKING." A thin pane is not
  // a defect in any element; it is the region failing to earn the width the shell gave it.
  //
  // MEASURED ON TEXT-BEARING LEAVES, never the tallest descendant. A full-height flex container spans the
  // pane, so a max-descendant measure reports 100% ink on an evacuated region — measured live, that exact
  // mistake returned "100%" for a pane whose last text sat at 40%.
  //
  // ONLY THE LOW SIDE, and only on a region that is NOT scrolled: content past the fold is a scroll, not
  // a void, and the region legitimately continues below the measured box.
  var paneInks = [];
  var INK_MIN_HEIGHT_PX = 400;
  var INK_MIN_LEAVES = 3;
  var INK_MAX_ROWS = 6;
  var INK_SCROLL_TOLERANCE_PX = 4;
  var INK_RATIO_SCALE = 100;

  for (var pi = 0; pi < allEls.length && paneInks.length < INK_MAX_ROWS; pi += 1) {
    var pane = allEls[pi];
    if (!isVisible(pane)) continue;
    var prole = pane.getAttribute("role");
    if (!(pane.tagName === "MAIN" || prole === "region" || prole === "tabpanel")) continue;
    var prect = pane.getBoundingClientRect();
    if (prect.height < INK_MIN_HEIGHT_PX) continue;
    if (pane.scrollHeight - pane.clientHeight > INK_SCROLL_TOLERANCE_PX) continue;
    var leaves = pane.querySelectorAll("*");
    var lowest = prect.top;
    var textLeaves = 0;
    for (var li2 = 0; li2 < leaves.length; li2 += 1) {
      var leaf = leaves[li2];
      if (leaf.children.length !== 0) continue;
      if ((leaf.textContent || "").trim() === "") continue;
      if (!isVisible(leaf)) continue;
      textLeaves += 1;
      var lrect = leaf.getBoundingClientRect();
      if (lrect.bottom > lowest) lowest = lrect.bottom;
    }
    if (textLeaves < INK_MIN_LEAVES) continue;
    paneInks.push({
      selector: describe(pane),
      paneHeightPx: Math.round(prect.height),
      lastInkPx: Math.round(lowest - prect.top),
      inkRatio: Math.round(((lowest - prect.top) / prect.height) * INK_RATIO_SCALE) / INK_RATIO_SCALE,
      textLeaves: textLeaves,
    });
  }

  // ── quiet state: the OFF state must not outshout the ON state ─────────────
  // "17.61:1 OFF vs 7.65:1 ON is backwards" — the loudest object on the surface was a switch that was
  // turned OFF. This is an ORDERING question, not a threshold: no single contrast value here is wrong,
  // the RANK is. Base UI emits data-checked and data-unchecked on the same component, so the pair is the
  // author's own claim and this needs no semantics from us.
  var quietStates = [];
  var LUM_R = 0.2126;
  var LUM_G = 0.7152;
  var LUM_B = 0.0722;
  var SRGB_KNEE = 0.03928;
  var SRGB_LINEAR_DIV = 12.92;
  var SRGB_OFFSET = 0.055;
  var SRGB_SCALE = 1.055;
  var SRGB_EXP = 2.4;
  var WCAG_OFFSET = 0.05;
  var CHANNEL_MAX = 255;
  var QUIET_SCALE = 100;

  function relLum(rgb) {
    var chan = [];
    var parts = [rgb.r, rgb.g, rgb.b];
    for (var qi = 0; qi < 3; qi += 1) {
      var c = Number(parts[qi]) / CHANNEL_MAX;
      chan.push(c <= SRGB_KNEE ? c / SRGB_LINEAR_DIV : Math.pow((c + SRGB_OFFSET) / SRGB_SCALE, SRGB_EXP));
    }
    return LUM_R * chan[0] + LUM_G * chan[1] + LUM_B * chan[2];
  }

  // An element's own FILL against the nearest opaque ancestor fill — "how loud is this object",
  // deliberately not the text-contrast family's question.
  function fillContrast(el) {
    var own = parseRgb(getComputedStyle(el).backgroundColor);
    if (own === null || own.a <= 0) return null;
    var backdrop = resolveBackdrop(el.parentElement || el);
    if (backdrop.kind !== "flat") return null;
    var visibleOwn = compositeOver(own, backdrop.color);
    var ownLum = relLum(visibleOwn);
    var baseLum = relLum(backdrop.color);
    var hi = Math.max(ownLum, baseLum);
    var lo = Math.min(ownLum, baseLum);
    return Math.round(((hi + WCAG_OFFSET) / (lo + WCAG_OFFSET)) * QUIET_SCALE) / QUIET_SCALE;
  }

  var onEls = document.querySelectorAll("[data-checked]");
  var offEls = document.querySelectorAll("[data-unchecked]");
  var onBest = 0;
  var offBest = 0;
  var offSel = null;
  for (var oi2 = 0; oi2 < onEls.length; oi2 += 1) {
    if (!isVisible(onEls[oi2])) continue;
    var oc = fillContrast(onEls[oi2]);
    if (oc !== null && oc > onBest) onBest = oc;
  }
  for (var fi = 0; fi < offEls.length; fi += 1) {
    if (!isVisible(offEls[fi])) continue;
    var fc = fillContrast(offEls[fi]);
    if (fc !== null && fc > offBest) { offBest = fc; offSel = describe(offEls[fi]); }
  }
  // BOTH sides must be measurable or there is no ordering to judge — a one-sided sample is silence, and
  // the check is handed the honest absence rather than a fabricated comparison.
  if (onBest > 0 && offBest > 0 && offSel !== null) {
    quietStates.push({ selector: offSel, offContrast: offBest, onContrast: onBest });
  }

  // ── simultaneous empty states ─────────────────────────────────────────────
  // "The LIST pane says 'No extension pages yet / install a plugin' while the CONTENT pane says 'Pick an
  // extension page / choose one on the left' — but there is nothing on the left to choose." Two panes of
  // one surface, both empty, giving contradictory guidance. STRUCTURAL, because the app has exactly one
  // empty-state primitive: the count of simultaneously-rendered empty-state roots IS the shape, and
  // whether each offers an action is its own slot.
  var emptyStates = [];
  var emptyRoots = document.querySelectorAll("[data-slot=empty-state-root]");
  var visibleEmpty = [];
  var actionless = 0;
  for (var ei = 0; ei < emptyRoots.length; ei += 1) {
    if (!isVisible(emptyRoots[ei])) continue;
    visibleEmpty.push(emptyRoots[ei]);
    if (emptyRoots[ei].querySelector("[data-slot=empty-state-action]") === null) actionless += 1;
  }
  if (visibleEmpty.length > 0) {
    emptyStates.push({ selector: describe(visibleEmpty[0]), rendered: visibleEmpty.length, actionless: actionless });
  }
`;
