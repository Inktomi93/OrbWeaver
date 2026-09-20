// ui-audit in-page walker — segment: the COLLISION censuses (#816): text truncated to NOTHING, and a
// painted element whose own centre hit-tests to a local neighbour.
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
// AND THE UNASKABLE POINT IS COUNTED, NOT SKIPPED (#797's lesson, in this family's own words): a centre
// outside the viewport cannot be asked — `elementFromPoint` answers null there and null reads as "nobody
// else owns it". Those are tallied in both the legacy obscured scan and the rule-population settlement;
// the latter makes any unaskable member withhold the whole tool verdict instead of masquerading as clean.
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
  if (restHiddenRevealFine > 0) {
    relationalAccounting["reveal-coverage"] = { candidates: restHiddenRevealFine, judged: 0, withheld: { restHiddenReveal: restHiddenRevealFine }, excluded: {} };
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

  // ── obscured target: the compositor disagrees at the element's own centre (#816) ──
  var obscuredTargets = [];
  var obscuredCandidates = 0;
  var obscuredRecentred = 0;
  var obscuredRevealScrolls = 0;
  var obscuredUnaskable = 0;
  var obscuredUnaskableSubjects = [];
  // A hairline intersection is antialiasing, not a collision; a quarter of the box is a mis-tap.
  var OBSCURED_MIN_COVERED = 0.25;
  var OBSCURED_MIN_OVERLAP_PX = 4;
  // How far up to look for a shared ancestor. Beyond a local cluster the "overlap" is a page-level
  // overlay — a dialog over the app, a scrim, a portal'd menu — which is deliberate stacking, and the
  // whole reason this rule cannot be geometry-only.
  var OBSCURED_ANCESTOR_MAX = 5;
  // DELIBERATE LAYERING IS A DIFFERENT PAINT LAYER (measured while building this rule's own fixtures: a
  // \`position: fixed\` dialog over the page made EVERY covered node a finding — 100% covered, one per
  // element — which is exactly the false-positive factory the geometry-only version would have been).
  //
  // An overlay covers you FROM ANOTHER LAYER; a row collides with itself INSIDE one. So the loser and the
  // winner must share a stacking layer to be judged at all. The layer is the nearest ancestor-or-self
  // that takes the element out of its parent's painting order the ways that matter here — fixed/sticky
  // positioning, an explicit z-index, or an isolation island. (A bare \`position: absolute\` with no
  // z-index does NOT create a stacking context, and must not: two absolutely-placed row items colliding
  // is a real defect, not a layer.)
  var layerCache = new WeakMap();
  function paintLayerOf(el) {
    var known = layerCache.get(el);
    if (known !== undefined) return known;
    var ls = getComputedStyle(el);
    var own = ls.position === "fixed" || ls.position === "sticky" || (ls.zIndex !== "auto" && ls.zIndex !== "") || ls.isolation === "isolate";
    var value = own ? el : el.parentElement === null ? document.documentElement : paintLayerOf(el.parentElement);
    layerCache.set(el, value);
    return value;
  }
  function localCommonAncestor(a, b) {
    var up = 0;
    for (var an = a.parentElement; an !== null && up < OBSCURED_ANCESTOR_MAX; an = an.parentElement) {
      if (an.contains(b)) return an;
      up += 1;
    }
    return null;
  }
  function ownDirectText(el) {
    var t = "";
    for (var di = 0; di < el.childNodes.length; di += 1) {
      var dn = el.childNodes[di];
      if (dn.nodeType === 3) t += dn.textContent;
    }
    return t.trim().replace(/\\s+/g, " ");
  }
  function recenterObscuredCandidate(el) {
    obscuredRevealScrolls += 1;
    try {
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    } catch (e) {
      el.scrollIntoView(true);
    }
  }
  // ASK ONE CANDIDATE'S CENTRE WHERE IT CURRENTLY SITS, and return either the compositor's answer or the
  // NAMED reason it could not be asked. Extracted from the loop below so the reveal can be retried
  // against the identical question rather than against a second, subtly different copy of it.
  //
  // THE REVEAL IS OWED TO BOTH UNASKABLE REASONS, AND IT USED TO BE OWED TO ONLY ONE (lane
  // cb-audit-viewport, 2026-09-20). The off-frame branch re-centred and re-asked; the null-hit branch
  // did not, so a subject whose centre landed on the viewport's LAST PIXEL ROW withheld its verdict and,
  // because any withheld member withholds the whole tool verdict, poisoned the entire run.
  //
  // MEASURED, and it is a lottery rather than a property of the page: \`snap --file
  // docs/design/mocks/connections/editor.html --design-audit --viewport 1400x1000\` exited 2 with
  // \`unaskable=1\` naming \`span.fk centre=143,1000 rect=57,991..229,1009 hit-test-null\` — an 18px box
  // straddling the fold of a 1000px viewport — while the SAME file at \`--viewport 1400x2400\` exited 0
  // with \`unaskable=0\`. Nothing about the drawing changed; the taller viewport simply put a different
  // element on the fold. \`pointInFrame\` admits y=999.6 (it tests \`< innerHeight\`) and the compositor
  // still answers null there, which is exactly the gap between "outside the frame" and "unanswerable
  // where it is standing".
  //
  // UNASKABLE IS STILL UNASKABLE (#797 survives — its INPUT changed): a second null AFTER the reveal is
  // withheld exactly as before. A target the user must scroll to is reachable; a target that is covered
  // is covered wherever you scroll it. This only stops counting "we asked in the wrong place" as
  // "we asked and got nothing".
  function askObscuredCentre(el) {
    var askRect = el.getBoundingClientRect();
    var askX = askRect.left + askRect.width / 2;
    var askY = askRect.top + askRect.height / 2;
    var answer = { reason: "centre-outside-frame", hit: null, rect: askRect, cx: askX, cy: askY };
    if (!pointInFrame(askX, askY)) return answer;
    if (ownsPoint(el, askX, askY)) {
      answer.reason = "owned";
      return answer;
    }
    var askHit = document.elementFromPoint(askX, askY);
    answer.reason = askHit === null ? "hit-test-null" : "";
    answer.hit = askHit;
    return answer;
  }
  for (var ob = 0; ob < allEls.length; ob += 1) {
    var obel = allEls[ob];
    if (isDevChrome(obel) || obel.closest("[aria-hidden='true']") || isVisuallyHidden(obel)) continue;
    if (!isVisible(obel)) continue;
    // An element that declared \`pointer-events: none\` OPTED OUT of hit-testing — a decorative wash over
    // a card is supposed to lose its own centre, and flagging it would be a false-positive factory.
    if (getComputedStyle(obel).pointerEvents === "none") continue;
    var obInteractive = obel.matches(INTERACTIVE_SELECTOR);
    var obText = ownDirectText(obel);
    // Only what a user is meant to PRESS or READ: a bare layout div losing its centre to a child's
    // sibling is composition, not a defect.
    if (!obInteractive && obText.length === 0) continue;
    var obRect = obel.getBoundingClientRect();
    if (Math.min(obRect.width, obRect.height) <= 2) continue;
    if (!inVisualViewport(obRect)) continue;
    obscuredCandidates += 1;
    // A partially visible subject is OFFERED, so ask its real scroller to put the subject's own centre
    // in the compositor frame. This is the obscured census's equivalent of the earlier offered-control
    // reveal; measuring the off-frame centre as null made bottom-edge navigation and appearance tiles
    // poison a whole matrix cell even though one ordinary scroll made the question answerable. ONE
    // reveal, EITHER unaskable reason — see askObscuredCentre's header for the fold lottery this closes.
    var obAsk = askObscuredCentre(obel);
    if (obAsk.reason === "centre-outside-frame" || obAsk.reason === "hit-test-null") {
      recenterObscuredCandidate(obel);
      obAsk = askObscuredCentre(obel);
      if (obAsk.reason !== "centre-outside-frame" && obAsk.reason !== "hit-test-null") obscuredRecentred += 1;
    }
    obRect = obAsk.rect;
    // UNASKABLE, NOT UN-OBSCURED (#797): a centre that remains unanswerable after the legitimate reveal
    // answers null, and null is not evidence. Counted and NAMED, never silently dropped.
    if (obAsk.reason === "centre-outside-frame" || obAsk.reason === "hit-test-null") {
      obscuredUnaskable += 1;
      obscuredUnaskableSubjects.push({
        selector: describe(obel), reason: obAsk.reason, centre: { x: obAsk.cx, y: obAsk.cy },
        rect: { left: obRect.left, top: obRect.top, right: obRect.right, bottom: obRect.bottom },
        interactive: obInteractive, text: obText.slice(0, 40),
      });
      continue;
    }
    if (obAsk.reason === "owned") continue;
    var obHit = obAsk.hit;
    if (isDevChrome(obHit)) continue;
    // Ancestor/descendant paint is not a collision — a parent owning the point is the composite case
    // ownsPoint already adjudicates, and a child owning it is the element working normally.
    if (obHit.contains(obel) || obel.contains(obHit)) continue;
    if (localCommonAncestor(obel, obHit) === null) continue;
    // Cross-layer: a dialog, scrim, popover or sticky bar covering what is under it. Deliberate, and the
    // reason this rule cannot be geometry-only.
    if (paintLayerOf(obel) !== paintLayerOf(obHit)) continue;
    var obHitRect = obHit.getBoundingClientRect();
    var obOverlapW = Math.min(obRect.right, obHitRect.right) - Math.max(obRect.left, obHitRect.left);
    var obOverlapH = Math.min(obRect.bottom, obHitRect.bottom) - Math.max(obRect.top, obHitRect.top);
    // The winner does not even intersect this box: the disagreement is a transform/paint-order question,
    // not two things sharing pixels. Out of this rule's scope, and saying so beats guessing.
    if (obOverlapW <= 0 || obOverlapH <= 0) continue;
    var obCovered = (obOverlapW * obOverlapH) / (obRect.width * obRect.height);
    if (obCovered < OBSCURED_MIN_COVERED) continue;
    if (Math.max(obOverlapW, obOverlapH) < OBSCURED_MIN_OVERLAP_PX) continue;
    obscuredTargets.push({
      authoredTarget: authoredTargetClaim(obel),
      authoredHome: authoredTargetHome(obel),
      selector: describe(obel),
      hitAuthoredTarget: authoredTargetClaim(obHit),
      hitAuthoredHome: authoredTargetHome(obHit),
      hitSelector: describe(obHit),
      overlapPx: Math.round(obOverlapW),
      coveredRatio: Math.round(obCovered * 100) / 100,
      interactive: obInteractive,
      text: obText.slice(0, 40),
    });
  }
  // The collision-local reveals must not re-point the later census families or the pixel screenshot.
  // The interactive segment captured every scrollable ancestor before any probing and restored it once;
  // restore that same authoritative snapshot again after this second, narrower sweep.
  for (var osr = scrollRestore.length - 1; osr >= 0; osr -= 1) {
    var obscuredSlot = scrollRestore[osr];
    obscuredSlot.el.scrollTop = obscuredSlot.top;
    obscuredSlot.el.scrollLeft = obscuredSlot.left;
  }
  var obscuredScan = {
    candidates: obscuredCandidates,
    recentred: obscuredRecentred,
    revealScrolls: obscuredRevealScrolls,
    unaskable: obscuredUnaskable,
    subjects: obscuredUnaskableSubjects,
  };
  relationalAccounting["obscured-target"].candidates = obscuredCandidates;
  relationalAccounting["obscured-target"].judged = obscuredCandidates - obscuredUnaskable;
  relationalAccounting["obscured-target"].withheld = { unaskable: obscuredUnaskable };

`;
