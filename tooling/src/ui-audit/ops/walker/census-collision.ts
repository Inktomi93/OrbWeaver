// ui-audit in-page walker — segment: the COLLISION censuses (#816). This half owns text truncated to
// NOTHING, the shared `relationalAccounting` map every later segment adds keys to, and the two
// accounting-only families that ride it (`reveal-coverage`, `canvas-ink`). ITS SECOND HALF — the painted
// element whose own centre hit-tests to a local neighbour, and the compositor-reach mechanism that makes
// that answerable — MOVED to the sibling ops/walker/obscured-reach.ts (#2491); read that file's header
// for why, and keep it composed immediately after this segment.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the segments IN
// ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the pre-split monolith.
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
//
// WHY THIS SEGMENT EXISTS — the two blind spots a whole UX review fell through (side-eye
// docs/reviews/side-eye/2026-08-29-saved-casts-rules.md §9). At `--mobile` on the saved-casts picker the
// audit censused 420 nodes, reached 21 controls and returned ZERO P0/P1/P2 over BOTH of these, while a
// screenshot plus hand geometry caught them immediately:
//
//   1. A cast NAME rendered at 0px with a 57px natural width — present in the DOM, unreadable on screen.
//      `text-overflow`'s block arm requires `clientWidth > 0` and its inline arm requires a painted rect,
//      so the collapse fell between them; worse, the walker's own `isVisible` requires `rect.width > 0`,
//      so a zero-width name is invisible to EVERY family. "Nothing is painted" was being read as
//      "nothing to judge" — the same class of false clean as an empty census (#409).
//   2. A "2 rules" badge overlapping the Start button by 48px where `elementFromPoint` at the badge's own
//      centre returns the button's <svg>: what the user taps is not what they aimed at. Nothing measured
//      it — `--expect-no-overflow [role=dialog]` PASSED because the collision is INSIDE the dialog, and
//      the tap-target census asks "is this control big enough", never "is it still the thing at its own
//      centre".
//
// THE DISCRIMINATOR FOR (2) IS THE HIT TEST, NEVER GEOMETRY (issue #816, stated). Intersecting rects are
// normal: a menu over a row, a scrim over the page, a tooltip over its trigger are all deliberate
// stacking. What is never deliberate is a LOCAL neighbour owning your centre — so the census asks the
// compositor (the same `ownsPoint` vocabulary the tap-target probe uses, including its forwarding-label
// and shared-composite credit) and requires the winner to share an ancestor within a few levels.
//
// THE UNASKABLE-POINT ACCOUNTING that closes (2) moved with the census — ops/walker/obscured-reach.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_COLLISION = `  // ── truncated to NOTHING (#816) ────────────────────────────────────────────
  var relationalAccounting = {
    "truncated-to-nothing": { candidates: 0, judged: 0, withheld: {}, excluded: {} },
    "obscured-target": { candidates: 0, judged: 0, withheld: {}, excluded: {} },
  };
  // \`relationalAccounting\` is FIRST INITIALIZED here (this segment runs before cohort/selection/grid,
  // which only ADD keys) — and AFTER census-interactive.ts, whose \`restHiddenRevealFine\` this reads
  // (#1077). Present ONLY when nonzero: a page with no reveal cluster prints no \`reveal-coverage\` row
  // at all, never a zeroed one.
  //
  // EXCLUDED, NOT WITHHELD (#2468, 2026-09-20) — the same polarity call \`canvas-ink\` makes four lines
  // down, and for the same reason. This row shipped as a WITHHOLDING, so every list surface in the app
  // (ROW_REVEAL is the house row-actions idiom) was a permanent NO VERDICT at a fine pointer, whatever it
  // looked like: measured \`restHiddenReveal=30\` on \`--goto characters\` at a5b34759f, unfixable by any
  // operator action, printing a zero a reader would quote as coverage. The census PROVED these controls
  // out of this pass's scope rather than failing to measure them — accumulated opacity is exactly 0 while
  // display, visibility and geometry are all live (core.ts's \`isOpacityOnlyHidden\`), which is the house
  // reveal cluster and means the fine REST regime does not offer them at all. The regime that does offer
  // them judges them directly: at coarse they are \`pointer-coarse:opacity-100\`, \`restHiddenRevealFine\`
  // is never incremented, and the same controls enter the tap-target and accessible-name censuses as
  // ordinary candidates — which is why this is a closed regime and not a blinded eye. The COUNT is
  // unchanged and still printed; only the word changed.
  if (restHiddenRevealFine > 0) {
    relationalAccounting["reveal-coverage"] = { candidates: restHiddenRevealFine, judged: 0, withheld: {}, excluded: { restHiddenReveal: restHiddenRevealFine } };
  }
  // CANVAS INK IS EXCLUDED, NEVER A SILENT ZERO (#1079, orb-ui audit F7). ECharts' rendered ink
  // (Chart/BarList/Heatmap/Histogram/Scatter/StatFigure — all through chart.tsx's <canvas>) yields zero
  // text/color candidates to every DOM census: no computed style, no text run, no accessible name can
  // read pixels a canvas paints. EXCLUDED, not withheld — the census reached it and the fact that it is
  // out of a DOM census's scope is proven, not missing evidence. Present ONLY when nonzero. No OCR.
  var canvasInkCount = 0;
  var canvasEls = document.querySelectorAll("canvas");
  for (var cvi = 0; cvi < canvasEls.length; cvi += 1) {
    if (isVisible(canvasEls[cvi])) canvasInkCount += 1;
  }
  if (canvasInkCount > 0) {
    relationalAccounting["canvas-ink"] = { candidates: canvasInkCount, judged: 0, withheld: {}, excluded: { canvasPaint: canvasInkCount } };
  }
  var truncatedTexts = [];
  // Below this there is no word to lose — a 4px sliver is a rounding artefact, not an erased label.
  var TRUNC_MIN_NATURAL_PX = 8;
  // "Nothing survives": sub-pixel, not "a bit narrow". A label with even 2px showing is the
  // text-overflow family's business (it spills or ellipses); this rule is about total erasure.
  var TRUNC_MAX_VISIBLE_PX = 1;
  function nearestClipper(el) {
    for (var cn = el; cn !== null && cn !== document.documentElement; cn = cn.parentElement) {
      if (clipsOverflow(getComputedStyle(cn))) return cn;
    }
    return null;
  }
  // The clipper's CONTENT box in viewport coordinates. clientWidth is 0 for an inline box that still
  // paints, so an inline clipper falls back to its border box rather than reporting a false zero.
  function clipContentSpan(clip) {
    var cr = clip.getBoundingClientRect();
    var left = cr.left + clip.clientLeft;
    var width = clip.clientWidth > 0 || cr.width <= 2 ? clip.clientWidth : cr.width;
    return { left: left, right: left + width };
  }
  for (var tt = 0; tt < allEls.length; tt += 1) {
    var ttel = allEls[tt];
    if (isDevChrome(ttel) || ttel.closest("[aria-hidden='true']") || isVisuallyHidden(ttel)) continue;
    if (ttel.namespaceURI === "http://www.w3.org/2000/svg") continue;
    // DIRECT text only, the same rule the overflow census uses: a wrapper's zero width is its text
    // child's finding, and reporting both would double-count one erased label.
    var ttText = "";
    for (var tc = 0; tc < ttel.childNodes.length; tc += 1) {
      var ttn = ttel.childNodes[tc];
      if (ttn.nodeType === 3 && ttn.textContent.trim().length > 0) ttText += ttn.textContent;
    }
    ttText = ttText.trim().replace(/\\s+/g, " ");
    if (ttText.length === 0) continue;
    var ttStyle = getComputedStyle(ttel);
    // NOT isVisible(): its \`rect.width > 0\` clause IS the blind spot this family exists for. Everything
    // else it tests still applies — a display:none / visibility:hidden / fully transparent label is
    // absent by intent, not erased by layout.
    if (ttStyle.display === "none" || ttStyle.visibility === "hidden" || accumulatedOpacity(ttel) === 0) continue;
    var ttRect = ttel.getBoundingClientRect();
    // It must still occupy a LINE (so the text was laid out at all) and sit on the visible canvas.
    if (ttRect.height <= 0 || !inVisualViewport(ttRect)) continue;
    var ttNaturalPx = ttel.scrollWidth;
    if (ttNaturalPx < TRUNC_MIN_NATURAL_PX) continue;
    var ttClip = nearestClipper(ttel);
    // No clipping ancestor at all: the text paints OUTSIDE its collapsed box and is readable — that is
    // the overflow family's business, never an erasure. This clause is what keeps the rule honest.
    if (ttClip === null) continue;
    relationalAccounting["truncated-to-nothing"].candidates += 1;
    var ttSpan = clipContentSpan(ttClip);
    var ttVisible = Math.min(ttSpan.right, ttRect.left + ttNaturalPx) - Math.max(ttSpan.left, ttRect.left);
    relationalAccounting["truncated-to-nothing"].judged += 1;
    if (ttVisible > TRUNC_MAX_VISIBLE_PX) continue;
    truncatedTexts.push({
      authoredTarget: authoredTargetClaim(ttel),
      authoredHome: authoredTargetHome(ttel),
      selector: describe(ttel),
      naturalPx: Math.round(ttNaturalPx),
      visiblePx: Math.max(0, Math.round(ttVisible)),
      clipSelector: describe(ttClip),
      text: ttText.slice(0, 60),
    });
  }


`;
