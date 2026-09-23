// ui-audit in-page walker — segment: THE PAGE'S OWN FRAME versus the viewport it is being judged at.
//
// WHAT THIS EXISTS FOR, MEASURED (2026-09-20, lane cb-audit-viewport, the three step-3b Connections
// mocks). `pnpm snap --file <connections mock> --design-audit --mobile`
// emitted 24 P1 `text-overflow` rows and exited 1; the SAME document at `--viewport 1400x1000` emitted
// zero and exited 0. Nothing in the rule was mismeasuring — every one of those 24 spills is a true
// `scrollWidth > clientWidth` read of the pixels that were on the screen.
//
// THE PAGE WAS IN A STATE ITS AUTHOR NEVER AUTHORED, and that is the distinction the next reader must
// not lose (it is why the repair is HERE and not in census-quality.ts). The mock declares its boards at
// a fixed width — `.body.w870 { width: 870px }` — but they are flex items, so `flex-shrink: 1` crushed
// them: measured computed `width` was "382px" and "468.594px" under `--mobile` against "870px"/"870px"
// at 1400x1000. 22 of the 24 rows sat inside those crushed boards and the other 2 were the page's own
// `p.lede` prose (clientWidth 382, scrollWidth 464 — a long unbreakable source path). A rule "fix" that
// softened the spill test would have deleted a REAL narrow-viewport overflow while leaving the crushed
// layout unexplained; the honest answer is that a document which does not fit the width it was laid out
// at is a document this instrument cannot give a geometry verdict about, and it must say so by name.
//
// HORIZONTAL ONLY, AND THE VERTICAL HALF IS A DELIBERATE REFUSAL TO REFUSE. Pages scroll DOWN by design
// — `editor.html` is 9,030px tall at a 1,000px viewport and that is ordinary — so a content-height test
// would make almost every audit a NO VERDICT and teach a reader to ignore the refusal, which is the
// calibration damage this whole module exists to prevent. The tall-page symptom that sent this lane here
// (`editor.html` exit 2 at 1400x1000, exit 0 at 1400x2400) was a DIFFERENT defect with its own repair in
// census-collision.ts: a subject straddling the fold whose in-frame centre hit-tested null never got the
// reveal the off-frame branch already had. Height decided only WHICH element landed on the fold.
//
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the segments
// IN ORDER into COLLECT_SAMPLES_JS. This one runs IMMEDIATELY after WALKER_CORE and before any census
// that scrolls, which is load-bearing twice over: the frame is the page's RESTING layout, and this
// segment reads only core's primitives (`allEls`, `isVisible`, `isDevChrome`, `describe`) so it carries
// no ordering debt to a later segment's `var` vocabulary. Raw JS in a template literal (no backticks /
// dollar-brace — see _shared/browser.ts for why a string, not a function). Provenance: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_FRAME = `  // ── document frame vs viewport ───────────────────────────────────────────
  // 2px is snap's OVERFLOW_TOLERANCE_PX twin (ops/overflow.ts), re-spelled rather than imported for the
  // same reason census-occlusion.ts re-spells PAINTED_MIN_PX: snap depends on ui-audit, never the
  // reverse, and this is a JS string no import can reach. Sub-pixel layout rounding is not a crushed
  // frame, and a refusal that fired on 0.5px would be a tax every run pays.
  var FRAME_TOLERANCE_PX = 2;
  // A reader repairs the WORST few and re-runs; the full count rides alongside so a truncated list can
  // never read as the whole population (the #1038 cap-ledger discipline, one family down).
  var FRAME_CARRIER_CAP = 5;
  var frameViewportWidth = document.documentElement.clientWidth;
  var frameContentWidth = document.documentElement.scrollWidth;
  var frameFound = [];
  var frameHits = [];
  if (frameContentWidth - frameViewportWidth > FRAME_TOLERANCE_PX) {
    for (var fr = 0; fr < allEls.length; fr += 1) {
      var frel = allEls[fr];
      var frTag = frel.tagName.toLowerCase();
      // html/body RESTATE the headline rather than locating it — both read exactly the document's own
      // clientWidth/scrollWidth pair, which the gap's first sentence already carries. Naming them as
      // carriers would hand a reader two rows that cannot be repaired, ahead of the ones that can.
      if (frTag === "html" || frTag === "body") continue;
      if (isDevChrome(frel) || !isVisible(frel)) continue;
      var frStyle = getComputedStyle(frel);
      // A SCROLLER'S CONTENT IS OFFERED, NOT SPILLED — the same call census-quality.ts's overflow census
      // makes. Content past a scroll region's edge is reachable, and the region's own box is what sizes
      // the page; only an UNSCROLLABLE box that cannot hold its content pushes the document wider.
      var frOverflow = (frStyle.overflowX || "") + " " + (frStyle.overflow || "");
      if (/auto|scroll/.test(frOverflow)) continue;
      var frRect = frel.getBoundingClientRect();
      var frClient = frel.clientWidth;
      var frScroll = frel.scrollWidth;
      // TWO CARRIER SHAPES, because one of them alone misses half the population (both measured on the
      // mock above): a box whose own content does not fit it (p.lede, 382 vs 464 — its RECT is inside
      // the viewport and only its ink escapes), and a box whose rect is itself past the viewport edge
      // (div.body.w870, 63px past — its content fits the box, the box does not fit the page).
      var frSpill = frClient > 0 ? frScroll - frClient : 0;
      var frPast = Math.round(frRect.right + window.scrollX - frameViewportWidth);
      if (frSpill <= FRAME_TOLERANCE_PX && frPast <= FRAME_TOLERANCE_PX) continue;
      if (frRect.width <= 0) continue;
      frameHits.push({
        el: frel,
        row: {
          selector: describe(frel),
          clientWidth: Math.round(frClient),
          scrollWidth: Math.round(frScroll),
          spillPx: Math.max(0, Math.round(frSpill)),
          pastViewportPx: Math.max(0, frPast),
        },
      });
    }
    // ONE CAUSE PER ROW — THE OUTERMOST. A crushed box crushes everything inside it, so its descendants
    // report the same overflow again and a naive worst-first list spends itself on copies of one defect.
    // Measured on the mock above BEFORE this filter: four of the five printed rows were a \`div.rb\` and
    // the \`span.badgerail\` INSIDE it, twice over, all reading +96px — while the board that actually
    // crushed them never appeared. A reader repairs the outermost carrier and the inner ones go with it.
    var frameOuter = new Set();
    for (var fo = 0; fo < frameHits.length; fo += 1) frameOuter.add(frameHits[fo].el);
    for (var fk = 0; fk < frameHits.length; fk += 1) {
      var frInherited = false;
      for (var fa = frameHits[fk].el.parentElement; fa !== null; fa = fa.parentElement) {
        if (frameOuter.has(fa)) { frInherited = true; break; }
      }
      if (!frInherited) frameFound.push(frameHits[fk].row);
    }
    frameFound.sort(function (frA, frB) { return (frB.spillPx + frB.pastViewportPx) - (frA.spillPx + frA.pastViewportPx); });
  }
  var documentFrame = {
    viewportWidth: frameViewportWidth,
    contentWidth: frameContentWidth,
    // Carried but never judged — a reader diagnosing a crushed frame wants to know how tall the page it
    // was looking at actually was, and the HORIZONTAL-ONLY note in this file's header is the ruling.
    viewportHeight: document.documentElement.clientHeight,
    contentHeight: document.documentElement.scrollHeight,
    tolerancePx: FRAME_TOLERANCE_PX,
    carriers: { total: frameFound.length, worst: frameFound.slice(0, FRAME_CARRIER_CAP) },
  };
`;
