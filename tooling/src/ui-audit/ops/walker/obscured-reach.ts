// ui-audit in-page segment — THE OBSCURED-TARGET CENSUS AND ITS REVEAL. Raw JS in a template literal (no
// backticks / dollar-brace — see _shared/browser.ts for why a string, not a function). Composed by
// ops/walker.ts immediately after WALKER_CENSUS_COLLISION, of whose function scope it is a continuation:
// it reads that segment's `relationalAccounting` and the core segment's `describe`/`isVisible`/`ownsPoint`
// vocabulary, so the ORDER is load-bearing and it has no other valid position.
//
// WHY IT IS ITS OWN FILE, AND NOT AN ARM INSIDE census-collision.ts. The two censuses answer different
// questions (a label erased by its clipper vs. a control whose own centre a LOCAL neighbour owns), and
// this one alone owns the compositor-reach mechanism — `askObscuredCentre`, `recenterObscuredCandidate`
// and the device-pixel fold below. Its committed proof was authored as
// `tests/tooling/ui-audit/ops/walker/obscured-reach.int.test.ts` against a module of this name that did
// not exist, which is the `test-layout` mirror miss #2491 carried: the spec named the subject correctly
// and the tree did not have it. Homing the subject here makes the mirror TRUE rather than merely
// resolving — the distinction `tooling/src/verify/gates/test-layout.ts`'s own DECLARED CAPABILITY LIMIT
// (#2264) exists to name, since that gate proves a test's name resolves and never that the file is its
// subject.
//
// AND THE UNASKABLE POINT IS COUNTED, NOT SKIPPED (#797's lesson, in this family's own words): a centre
// outside the viewport cannot be asked — `elementFromPoint` answers null there and null reads as "nobody
// else owns it". Those are tallied in both the legacy obscured scan and the rule-population settlement;
// the latter makes any unaskable member withhold the whole tool verdict instead of masquerading as clean.
// Chrome rounds the hit-test point to the DEVICE PIXEL, so a subject straddling the fold is answerable
// nowhere it stands and everywhere it can be scrolled to — `recenterObscuredCandidate` is what makes that
// a measurement rather than a lottery any page can draw (measured at 1400x1000: y=999.4 hits, y=999.5 is
// null).
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_OBSCURED_REACH = `
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
