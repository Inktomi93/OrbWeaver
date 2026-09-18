// ui-audit in-page walker — segment: the two PLACEMENT-COLLISION censuses adapted from impeccable's
// `text-occlusion` arms (ii) and (iii). Arm (i) — the elementFromPoint hit-test collision — was already
// adopted as our own `obscured-target` (#816) and lives in census-collision.ts; these are the two arms
// that were deferred on cost when that one landed, and this segment is their build-out.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the segments IN
// ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the pre-split monolith.
// It must run AFTER census-collision.ts, which declares `relationalAccounting` and `paintLayerOf`.
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
//
// WHY THESE TWO ARMS, AND WHY THIS ONE IS NOT A HYPOTHETICAL. Arm (iii) — an `inline` element carrying
// block-scale vertical padding — is, in our closed world, a VARIANT MISAPPLICATION: a `tv()` slot handed
// padding that was authored for a block. Inline padding reserves no vertical space, so the painted fill
// overflows its own line box and lands on the lines above and below instead of enclosing its own text.
// Nothing else this instrument measures can see that: the element's contrast is fine, its geometry is
// fine, its hit test is fine, and `getBoundingClientRect` on the VICTIM reports nothing wrong at all.
//
// AND WHY THE RECTS HAD TO BE RE-DERIVED. `getBoundingClientRect` reports where a box WOULD be if
// nothing clipped it — a row half-scrolled out of a panel still reports its full height — so a naive rect
// intersection mints collisions that were never painted. Every rect below is first intersected against
// the CONTENT box of every clipping-or-scrolling ancestor (paintedRect); a subject whose painted rect
// collapses is WITHHELD, never silently judged clean.
//
// THAT CLIP WALK IS OURS, NOT PORTED, and the claim is scoped to the vintage actually read (2026-09-01,
// the impeccable design-review reference, `cli/engine/rules/checks.mjs`
// `checkTextOcclusionDOM` at line 5136, and the identical function in the bundled
// `cli/engine/detect-antipatterns-browser.js` at 6370): both arms there read bare
// `el.getBoundingClientRect()` — arm (ii) through the shared `textEls` collection, which is itself built
// with `rect = el.getBoundingClientRect()` — and neither intersects any ancestor. The token
// `paintedRect` does occur in that codebase, but only in `browser/injected/index.mjs`
// (`resolvePaintedImageRect` / `pointToImageSource`, an object-fit intrinsic-size mapper for image pixel
// sampling), never inside the occlusion rule. A later vintage may add one; re-derive before citing.
//
// UPSTREAM'S ARM (iii) ALSO OVER-FIRES ON MULTI-LINE INLINES. A `<span>` wrapping across three lines has
// a bounding rect three line-heights tall, which clears any "height >= 2.2x line-height" bar on wrapping
// alone. The leak is a property of ONE LINE FRAGMENT, so this census measures `getClientRects()` — one
// rect per fragment — and judges the tallest surviving fragment. A padded inline highlight sits at ~1x
// line-height per fragment however many lines it wraps to; only a leak clears the bar.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_OCCLUSION = `  // ── painted geometry: what actually survives to the screen ────────────────
  // THE REASONING HOME FOR THIS WALK IS tooling/src/snap/ops/overflow.ts, and the code cannot be shared
  // because the two ask OPPOSITE questions: snap walks DOWN from one root asking "does any descendant
  // escape THIS clip boundary", carrying an inherited verdict down the tree; this walks UP from one
  // subject asking "what of this box survives every clipping ancestor". Same predicates, opposite
  // direction. Three of its hard-won facts are taken here rather than rediscovered: the boundary is the
  // PADDING box, auto/scroll clip paint exactly as hidden/clip do, and a sub-2px box is plumbing.
  //
  // axisClips / axisScrolls are snap's names, kept so a reader connects the two files. Both clip PAINT,
  // which is why this segment tests their union where core.ts's clipsOverflow tests only axisClips:
  // core.ts asks "does this box CUT its content" — for the truncation rule, where a scroller does not
  // erase a label, it OFFERS it — while this asks "which pixels are on screen at the instant we
  // measure", and a scroller hides what is outside its box exactly as hard as overflow:hidden. Two
  // questions, two predicates. Neither is the other's bug, and unifying them silently breaks one.
  function axisClips(value) {
    return value === "hidden" || value === "clip";
  }
  function axisScrolls(value) {
    return value === "auto" || value === "scroll";
  }
  function clipsPaint(style) {
    var ox = style.overflowX || "";
    var oy = style.overflowY || "";
    return axisClips(ox) || axisClips(oy) || axisScrolls(ox) || axisScrolls(oy);
  }
  // OVERFLOW DOES NOT CLIP OUT OF ITS CONTAINING BLOCK, and this walk is where that bites: an
  // absolutely-positioned headline inside an overflow:hidden panel is NOT cut by that panel unless the
  // panel is its containing block, and a fixed one is not cut by any ordinary ancestor at all. Ignoring
  // this would withhold exactly the layered subjects arm (ii) exists to judge. Fixed subjects take the
  // conservative exit (no ancestor clipping); absolute ones skip clippers until the walk reaches their
  // nearest positioned ancestor, which IS their containing block and does clip from there up.
  function intersectClippers(el, box) {
    var elPosition = getComputedStyle(el).position;
    if (elPosition === "fixed") return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    var beforeContainingBlock = elPosition === "absolute";
    var left = box.left;
    var top = box.top;
    var right = box.right;
    var bottom = box.bottom;
    for (var pc = el.parentElement; pc !== null; pc = pc.parentElement) {
      var pcStyle = getComputedStyle(pc);
      if (beforeContainingBlock) {
        if (pcStyle.position === "static") continue;
        beforeContainingBlock = false;
      }
      if (!clipsPaint(pcStyle)) continue;
      // THE PADDING BOX, NOT THE BORDER BOX — that is exactly where overflow cuts, so clientLeft/clientTop
      // peel the border and clientWidth/clientHeight peel the scrollbar gutter. Intersecting against the
      // bare border box is off by both on every scroll container (snap/ops/overflow.ts, paid by #439).
      // NO scroll-origin shift here, and that is the one place this deliberately diverges from snap: it
      // judges REACHABILITY, where content scrolled past the origin is still gettable, so it extends the
      // boundary by scrollLeft/scrollTop. This judges PAINT, and both rects are already in post-scroll
      // viewport coordinates — extending the boundary would readmit pixels that are scrolled away and not
      // painted, which is the exact phantom this walk exists to remove.
      var pcRect = pc.getBoundingClientRect();
      var pcLeft = pcRect.left + pc.clientLeft;
      var pcTop = pcRect.top + pc.clientTop;
      // An inline clipper reports clientWidth 0 while still painting, so it falls back to its border box
      // rather than collapsing every descendant to nothing (the clipContentSpan precedent).
      var pcWidth = pc.clientWidth > 0 ? pc.clientWidth : pcRect.width;
      var pcHeight = pc.clientHeight > 0 ? pc.clientHeight : pcRect.height;
      left = Math.max(left, pcLeft);
      top = Math.max(top, pcTop);
      right = Math.min(right, pcLeft + pcWidth);
      bottom = Math.min(bottom, pcTop + pcHeight);
    }
    return { left: left, top: top, right: right, bottom: bottom, width: right - left, height: bottom - top };
  }
  // Collapsed to nothing is UNMEASURABLE, not un-collided (#797's lesson in this family's words): a
  // subject scrolled out of its own panel paints no pixels here, so any overlap we computed from its
  // unclipped rect would be a collision the eye never saw. The 2px floor is snap's OVERFLOW_TOLERANCE_PX
  // twin — a sub-2px box is plumbing (and is every sr-only stub), with nothing to cut and nothing to hit.
  var PAINTED_MIN_PX = 2;
  function paintedRect(el) {
    var painted = intersectClippers(el, el.getBoundingClientRect());
    return painted.width < PAINTED_MIN_PX || painted.height < PAINTED_MIN_PX ? null : painted;
  }
  function overlapOf(a, b) {
    return {
      x: Math.min(a.right, b.right) - Math.max(a.left, b.left),
      y: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
    };
  }
  // ── arm (ii): a display headline overhanging an opaque card ───────────────
  // The bulk of the line sits outside a bounded content card and only its EDGE clips in. The text may
  // still paint on top and stay readable — the defect is that two layers were dropped on the same pixels,
  // which is a placement accident nobody chose, not a composition.
  relationalAccounting["headline-overhang"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  relationalAccounting["inline-padding-leak"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  var headlineOverhangs = [];
  var inlinePaddingLeaks = [];
  // Display scale: below this the line is a heading inside the flow, and an ordinary heading brushing a
  // neighbouring card is ordinary layout. 40px is the scale at which a line is placed, not typeset.
  var OVERHANG_MIN_FONT_PX = 40;
  // A card is OPAQUE (it hides what is under it), BOUNDED (a border or shadow draws its edge), and a real
  // content container rather than a page-wide band or a chip.
  var OVERHANG_CARD_MIN_ALPHA = 0.7;
  var OVERHANG_CARD_MIN_WIDTH_PX = 100;
  var OVERHANG_CARD_MAX_WIDTH_FRACTION = 0.8;
  var OVERHANG_CARD_MIN_HEIGHT_PX = 60;
  // A hairline is antialiasing; half a line-height of vertical overlap is the text genuinely entering it.
  var OVERHANG_MIN_X_PX = 8;
  var OVERHANG_MIN_Y_LINES = 0.5;
  // Past half the headline's width the line is not overhanging the card, it is IN the card.
  var OVERHANG_MAX_X_FRACTION = 0.5;
  var overhangCards = [];
  for (var oc = 0; oc < allEls.length; oc += 1) {
    var ocel = allEls[oc];
    if (isDevChrome(ocel) || isVisuallyHidden(ocel)) continue;
    if (ocel.namespaceURI === "http://www.w3.org/2000/svg") continue;
    if (!isVisible(ocel)) continue;
    var ocStyle = getComputedStyle(ocel);
    var ocBg = parseRgb(ocStyle.backgroundColor);
    if (ocBg === null || ocBg.a <= OVERHANG_CARD_MIN_ALPHA) continue;
    // A gradient or image layer is a decorative panel whose edge is a wash, not a card boundary.
    var ocImage = ocStyle.backgroundImage || "";
    if (ocImage !== "" && ocImage !== "none") continue;
    var ocBordered = Number.parseFloat(ocStyle.borderTopWidth) > 0 || Number.parseFloat(ocStyle.borderRightWidth) > 0 || Number.parseFloat(ocStyle.borderBottomWidth) > 0 || Number.parseFloat(ocStyle.borderLeftWidth) > 0;
    var ocShadowed = ocStyle.boxShadow !== "" && ocStyle.boxShadow !== "none";
    if (!ocBordered && !ocShadowed) continue;
    var ocPainted = paintedRect(ocel);
    if (ocPainted === null) continue;
    if (ocPainted.width < OVERHANG_CARD_MIN_WIDTH_PX) continue;
    if (ocPainted.width > OVERHANG_CARD_MAX_WIDTH_FRACTION * window.innerWidth) continue;
    if (ocPainted.height < OVERHANG_CARD_MIN_HEIGHT_PX) continue;
    overhangCards.push({ el: ocel, rect: ocPainted });
  }
  for (var oh = 0; oh < allEls.length; oh += 1) {
    var ohel = allEls[oh];
    if (isDevChrome(ohel) || ohel.closest("[aria-hidden='true']") || isVisuallyHidden(ohel)) continue;
    if (ohel.namespaceURI === "http://www.w3.org/2000/svg") continue;
    if (!isVisible(ohel)) continue;
    if (ownDirectText(ohel).length < 2) continue;
    var ohStyle = getComputedStyle(ohel);
    var ohFont = Number.parseFloat(ohStyle.fontSize);
    if (!(ohFont >= OVERHANG_MIN_FONT_PX)) continue;
    var ohRaw = ohel.getBoundingClientRect();
    // VIEWPORT-BOUND, and the finding says so: the card census and this one both read live geometry for
    // the scroll position the walk ran at, so a collision two screens down is out of this arm's reach.
    if (!inVisualViewport(ohRaw)) continue;
    relationalAccounting["headline-overhang"].candidates += 1;
    var ohPainted = paintedRect(ohel);
    if (ohPainted === null) {
      relationalAccounting["headline-overhang"].withheld["clipped-away"] = (relationalAccounting["headline-overhang"].withheld["clipped-away"] || 0) + 1;
      continue;
    }
    var ohLine = Number.parseFloat(ohStyle.lineHeight);
    if (!Number.isFinite(ohLine)) ohLine = ohFont * 1.2;
    var ohCentreX = ohPainted.left + ohPainted.width / 2;
    var ohHit = null;
    var ohExcluded = "";
    for (var ohc = 0; ohc < overhangCards.length; ohc += 1) {
      var card = overhangCards[ohc];
      if (card.el === ohel || ohel.contains(card.el) || card.el.contains(ohel)) continue;
      var ohOverlap = overlapOf(ohPainted, card.rect);
      if (ohOverlap.x < OVERHANG_MIN_X_PX || ohOverlap.y < OVERHANG_MIN_Y_LINES * ohLine) continue;
      // CROSS-LAYER IS DELIBERATE STACKING, and this family already paid for the lesson once: a
      // position:fixed dialog over the page made every covered node a finding. A card that reaches the
      // headline from another paint layer is a dialog/popover/sticky bar, which is placement by design.
      if (paintLayerOf(ohel) !== paintLayerOf(card.el)) {
        if (ohExcluded === "") ohExcluded = "cross-layer";
        continue;
      }
      // The headline's CENTRE inside the card's x-range means the line lives IN the card. Proven
      // inapplicable, which is a different claim from "measured and clean".
      if (ohCentreX >= card.rect.left && ohCentreX <= card.rect.right) {
        ohExcluded = "centre-inside-card";
        continue;
      }
      if (ohOverlap.x > OVERHANG_MAX_X_FRACTION * ohPainted.width) {
        if (ohExcluded !== "centre-inside-card") ohExcluded = "bulk-inside-card";
        continue;
      }
      ohHit = { card: card, overlap: ohOverlap };
      break;
    }
    if (ohHit === null && ohExcluded !== "") {
      relationalAccounting["headline-overhang"].excluded[ohExcluded] = (relationalAccounting["headline-overhang"].excluded[ohExcluded] || 0) + 1;
      continue;
    }
    relationalAccounting["headline-overhang"].judged += 1;
    if (ohHit === null) continue;
    headlineOverhangs.push({
      authoredTarget: authoredTargetClaim(ohel),
      authoredHome: authoredTargetHome(ohel),
      selector: describe(ohel),
      cardSelector: describe(ohHit.card.el),
      fontSizePx: Math.round(ohFont),
      overlapPx: Math.round(ohHit.overlap.x),
      widthPx: Math.round(ohPainted.width),
      text: ownDirectText(ohel).slice(0, 40),
    });
  }

  // ── arm (iii): an inline element whose padding leaks off its line ─────────
  // PAGE-WIDE, not viewport-bound: this arm is pure geometry over one element's own line fragments, so
  // it answers as well below the fold as above it.
  var LEAK_MIN_ALPHA = 0.6;
  var LEAK_MIN_PADDING_PX = 24;
  // A padded inline highlight sits at roughly one line height PER FRAGMENT; the leak sits at several.
  var LEAK_MIN_LINE_MULTIPLE = 2.2;
  for (var lk = 0; lk < allEls.length; lk += 1) {
    var lkel = allEls[lk];
    if (isDevChrome(lkel) || isVisuallyHidden(lkel)) continue;
    if (lkel.namespaceURI === "http://www.w3.org/2000/svg") continue;
    var lkStyle = getComputedStyle(lkel);
    // \`display: inline\` EXACTLY. inline-block and inline-flex reserve their own vertical space and
    // enclose their padding correctly — the whole defect is that \`inline\` does not.
    if (lkStyle.display !== "inline") continue;
    if (lkStyle.visibility === "hidden" || accumulatedOpacity(lkel) === 0) continue;
    var lkBg = parseRgb(lkStyle.backgroundColor);
    if (lkBg === null || lkBg.a <= LEAK_MIN_ALPHA) continue;
    relationalAccounting["inline-padding-leak"].candidates += 1;
    var lkPadTop = Number.parseFloat(lkStyle.paddingTop) || 0;
    var lkPadBottom = Number.parseFloat(lkStyle.paddingBottom) || 0;
    if (lkPadTop + lkPadBottom < LEAK_MIN_PADDING_PX) {
      relationalAccounting["inline-padding-leak"].excluded["padding-below-floor"] = (relationalAccounting["inline-padding-leak"].excluded["padding-below-floor"] || 0) + 1;
      continue;
    }
    // ONE RECT PER LINE FRAGMENT. A wrapping inline's bounding rect is as tall as the run, which clears
    // any line-height multiple on wrapping alone; the leak is a property of a single fragment.
    var lkFragments = lkel.getClientRects();
    var lkTallest = null;
    for (var lf = 0; lf < lkFragments.length; lf += 1) {
      var lkPainted = intersectClippers(lkel, lkFragments[lf]);
      if (lkPainted.width < PAINTED_MIN_PX || lkPainted.height < PAINTED_MIN_PX) continue;
      if (lkTallest === null || lkPainted.height > lkTallest.height) lkTallest = lkPainted;
    }
    if (lkTallest === null) {
      relationalAccounting["inline-padding-leak"].withheld["clipped-away"] = (relationalAccounting["inline-padding-leak"].withheld["clipped-away"] || 0) + 1;
      continue;
    }
    relationalAccounting["inline-padding-leak"].judged += 1;
    var lkFont = Number.parseFloat(lkStyle.fontSize) || 16;
    var lkLine = Number.parseFloat(lkStyle.lineHeight);
    if (!Number.isFinite(lkLine)) lkLine = lkFont * 1.4;
    if (lkTallest.height < LEAK_MIN_LINE_MULTIPLE * lkLine) continue;
    // Name a neighbour the fill lands on when there is one. Evidence, never a gate: the leak paints over
    // whatever occupies those lines, and bare text nodes in the same parent are not elements to name.
    var lkOnto = "";
    var lkSiblings = lkel.parentElement === null ? [] : lkel.parentElement.children;
    for (var ls = 0; ls < lkSiblings.length; ls += 1) {
      var lkOther = lkSiblings[ls];
      if (lkOther === lkel || lkel.contains(lkOther) || lkOther.contains(lkel)) continue;
      if (getComputedStyle(lkOther).display === "none") continue;
      var lkOtherPainted = paintedRect(lkOther);
      if (lkOtherPainted === null) continue;
      var lkOverlap = overlapOf(lkTallest, lkOtherPainted);
      if (lkOverlap.x > 4 && lkOverlap.y > 4 && lkOther.textContent.trim().length > 0) {
        lkOnto = describe(lkOther);
        break;
      }
    }
    inlinePaddingLeaks.push({
      authoredTarget: authoredTargetClaim(lkel),
      authoredHome: authoredTargetHome(lkel),
      selector: describe(lkel),
      paintedHeightPx: Math.round(lkTallest.height),
      lineHeightPx: Math.round(lkLine),
      paddingPx: Math.round(lkPadTop + lkPadBottom),
      ontoSelector: lkOnto,
      text: (lkel.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40),
    });
  }

`;
