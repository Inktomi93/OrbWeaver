// ui-audit in-page walker — segment: the text/contrast/typography TreeWalker census + the image census (img + non-cover background-image).
//
// THE BACKGROUND-IMAGE ARM'S SIZING MODE (#1825, closed 2026-09-06, from the #1807 docs pass). That arm
// drops `background-size: cover|contain` and stamps every survivor `objectFit: "fill"` as a neutral
// placeholder for the shared distortion math (`lib/checks-media.ts` — only `fill` stretches). `fill` alone
// used to leave the DEFAULT `background-size: auto` — natural size, cannot squish, exactly like
// `object-fit: none` — indistinguishable from an explicit stretch, so a `backgroundSizeMode` field now
// carries the REAL sizing disposition alongside the placeholder: "auto" (every axis auto) excludes exactly
// like `object-fit: none`; anything else falls through to the "fill" math unchanged. The `<img>` half of
// the census reads the real computed keyword and was never affected.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into collectSamplesJs, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// floor/browser/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { FONT_PREVIEW_ATTRIBUTE } from "@orb/ui/select/items";
import { TOKENS } from "@orb/ui/tokens";
import { refuseDirectInvocation } from "../../../floor/cli/entrypoint.ts";
import { SAMPLE_RING_MAX_PX } from "../../../floor/instrument/pixel-backdrop.ts";
import { INACTIVE_KIND_EXPR } from "../../../floor/instrument/wcag.ts";
import { WALKER_PROVEN_RULES } from "../../contract/samples-populations.ts";
import { TRANSCRIPT_SURFACE_SELECTOR_JS } from "../../lib/checks-typography.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_TEXT = `
  // ── text / contrast / typography ─────────────────────────────────────────
  // A MASKED ANCESTOR MASKS THE DESCENDANT'S PAINT, NOT ITS OWN STYLE (#1078, orb-ui audit F6). The
  // universal \`.scroll-fade-x\`/\`.scroll-fade-y\` recipes put \`mask-image\` on the SCROLLING CONTAINER, and
  // CSS masking composites the whole subtree — a text node two levels inside a faded edge paints at a
  // real alpha \`getComputedStyle\` on the text itself never reports (its own \`color\`/\`opacity\` read
  // full-strength). Bounded exactly like the interactive-island wrapper walk: unrelated to the actual DOM
  // depth of a real fade recipe, but never an unbounded \`closest()\` that would over-withhold every text
  // node under a distant, unrelated masked ancestor.
  var MASK_ANCESTOR_DEPTH = 6;
  function hasMaskedAncestor(el) {
    for (var man = el, mlevels = 0; man && man !== document.body && mlevels <= MASK_ANCESTOR_DEPTH; man = man.parentElement, mlevels += 1) {
      var mStyle = getComputedStyle(man);
      var maskImage = mStyle.maskImage || mStyle.webkitMaskImage || "none";
      if (maskImage !== "none") return true;
    }
    return false;
  }
  // THE WALKER-PROVEN DENOMINATORS. Eight rules return only their findings, so a silent one needs the census
  // that looked to say how many subjects it saw. Each census tallies its own row here as it judges or
  // excludes; returns.ts folds the rows into relationalAccounting, which is declared after these segments.
  var walkerProvenCensus = {};
  var WALKER_PROVEN_RULES = ${JSON.stringify(WALKER_PROVEN_RULES)};
  for (var wpr = 0; wpr < WALKER_PROVEN_RULES.length; wpr += 1) {
    walkerProvenCensus[WALKER_PROVEN_RULES[wpr]] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  }
  // disposition is "judged", or { kind: "withheld" | "excluded", reason } — the house polarity.
  function walkerProvenTally(rule, disposition) {
    var row = walkerProvenCensus[rule];
    row.candidates += 1;
    if (disposition === "judged") {
      row.judged += 1;
      return;
    }
    var bucket = row[disposition.kind];
    bucket[disposition.reason] = (bucket[disposition.reason] || 0) + 1;
  }
  var texts = [];
  var textStyles = [];
  var fontFamilies = {};
  var FONT_PREVIEW_ATTRIBUTE = ${JSON.stringify(FONT_PREVIEW_ATTRIBUTE)};
  var fontSizes = {};
  var textEls = [];
  var seenTextEls = new Set();
  // REAL CHARACTER ADVANCE, not a guessed ratio (#464). line-length used to estimate
  // chars = rectWidth / (fontSize * 0.5); Geist's '0' advance is 0.573em, so that over-estimated every
  // measure by ~15% and the rule filed an "86 chars" P3 against a paragraph that is 75.0 REAL
  // characters — i.e. it indicted \`--reading-measure: 75ch\`, the house's own ratified measure. Canvas
  // measureText of the element's OWN computed font is the honest number and is exactly what the CSS
  // \`ch\` unit means, so the finding and the token are finally denominated the same way.
  // Memoized per font string: a page has a handful of fonts and hundreds of text nodes.
  var chWidthCache = {};
  var measureCtx = null;
  var chWidthOf = function (fontShorthand) {
    if (chWidthCache[fontShorthand] !== undefined) return chWidthCache[fontShorthand];
    if (measureCtx === null) measureCtx = document.createElement("canvas").getContext("2d") || false;
    var width = 0;
    if (measureCtx) {
      measureCtx.font = fontShorthand;
      width = measureCtx.measureText("0").width;
    }
    chWidthCache[fontShorthand] = width;
    return width;
  };
  // THE DESIGN LAW'S OWN UNIT, which is NOT the CSS \`ch\` above (#1183/#1145). \`ch\` is the '0' advance
  // (0.6625em in Geist); a character of running prose averages 0.42-0.46em, so one \`ch\` is ~1.5 of the
  // characters skill §2 counts and a 75ch box holds ~117 of them. Measuring the ELEMENT'S OWN TEXT rather
  // than a font-wide constant is what makes this the honest number: the average depends on the copy (a
  // line of capitals and a line of lowercase are different populations of glyph), and the browser's canvas
  // is the same rasterizer that will paint it. Capped so one enormous node cannot dominate the walk; the
  // rule needs >80 characters before it judges at all, so the cap never starves a real measure.
  var GLYPH_SAMPLE_MAX = 400;
  var GLYPH_SAMPLE_MIN = 20;
  var glyphAdvanceOf = function (fontShorthand, text) {
    if (text.length < GLYPH_SAMPLE_MIN) return 0;
    if (measureCtx === null) measureCtx = document.createElement("canvas").getContext("2d") || false;
    if (!measureCtx) return 0;
    var sample = text.slice(0, GLYPH_SAMPLE_MAX);
    measureCtx.font = fontShorthand;
    return measureCtx.measureText(sample).width / sample.length;
  };
  // ── BLOCK IDENTITY + INTENT, for the type-hierarchy-inversion rule (#652) ────────────────────────
  // "Semantic importance" is not computable from the DOM, so the rule does not guess it: it reads the
  // app's OWN vocabulary. \`data-voice\` is emitted by every @orb/ui <Text>/<Heading> (voice is an INTENT —
  // "what this text IS on the surface" — and the closed axis that replaced choosing size/weight/tone by
  // taste), and role=alert/alertdialog/status is the platform's own "this bounds what you are about to
  // do". Both are AUTHORED claims about meaning, not inferences from pixels.
  //
  // The comparison also needs to know which two nodes are IN THE SAME BLOCK, and a text sample carries no
  // tree. So each element gets a stable per-walk id and each sample carries the ids of its nearest few
  // ancestors; two samples are siblings-in-a-block when those lists intersect. Cheap, DOM-free on the Node
  // side, and bounded — a global "is there anything bigger on the page" test would flag every caption in
  // the product, which is the false-positive machine the rule must not be.
  var BLOCK_ANCESTOR_LEVELS = 4;
  var CAVEAT_ROLE_CTX = "[role='alert'],[role='alertdialog'],[role='status']";
  var blockIdSeq = 0;
  var blockIds = new WeakMap();
  var blockIdOf = function (element) {
    var known = blockIds.get(element);
    if (known !== undefined) return known;
    blockIdSeq += 1;
    blockIds.set(element, blockIdSeq);
    return blockIdSeq;
  };
  // A CARD OR LIST ITEM CLOSES THE BLOCK: siblings in a list of cards meet in the list, and a caveat in one
  // card is never weighed against the next card's title. The boundary itself stays in the path, so two
  // samples inside one card still share it. Card-ness is census-decor.ts's measured \`isCardLike\` (a
  // hoisted function over computed style); a list item is its tag or role.
  var BLOCK_ITEM_TAGS = { LI: 1, TR: 1 };
  var BLOCK_ITEM_ROLES = { listitem: 1, row: 1, option: 1, treeitem: 1, article: 1 };
  var closesBlock = function (element) {
    if (BLOCK_ITEM_TAGS[element.tagName] === 1) return true;
    if (BLOCK_ITEM_ROLES[String(element.getAttribute("role") || "").trim().toLowerCase()] === 1) return true;
    return isCardLike(element);
  };
  var blockPathOf = function (element) {
    var path = [];
    var anc = element.parentElement;
    for (var bl = 0; bl < BLOCK_ANCESTOR_LEVELS && anc !== null; bl += 1) {
      path.push(blockIdOf(anc));
      if (closesBlock(anc)) break;
      anc = anc.parentElement;
    }
    return path;
  };
  // THE CAVEAT IS THE BLOCK THAT CARRIES THE ROLE. An alert region's headline and explainer are its body copy;
  // only a sentence whose own block carries the role bounds what sits beside it. An inline run reads its
  // nearest block-level ancestor, which is the block it is set in.
  var alertCarrierOf = function (element, elementStyle) {
    if (element.matches(CAVEAT_ROLE_CTX)) return true;
    if (elementStyle.display.indexOf("inline") !== 0) return false;
    for (var blockAnc = element.parentElement; blockAnc !== null; blockAnc = blockAnc.parentElement) {
      if (getComputedStyle(blockAnc).display.indexOf("inline") !== 0) return blockAnc.matches(CAVEAT_ROLE_CTX);
    }
    return false;
  };
  var voiceOf = function (element) {
    var own = element.getAttribute("data-voice");
    if (own) return own;
    var carrier = element.closest("[data-voice]");
    return carrier ? carrier.getAttribute("data-voice") || "" : "";
  };

  // THE BOX OF THE GLYPHS ITSELF. An element box can be far larger than its text (a letter centred in a
  // feathered tile), and a ring taken at the element's edge then reads the tile's edge, not what sits
  // behind the letter. Null when the text fills the element, so the element box stays the sample.
  var INK_BOX_MIN_SLACK_PX = 8;
  var inkRange = document.createRange();
  var inkBoxOf = function (element, elementRect) {
    var left = Infinity;
    var top = Infinity;
    var right = -Infinity;
    var bottom = -Infinity;
    for (var inkIndex = 0; inkIndex < element.childNodes.length; inkIndex += 1) {
      var inkChild = element.childNodes[inkIndex];
      if (inkChild.nodeType !== 3 || !inkChild.textContent || inkChild.textContent.trim().length === 0) continue;
      inkRange.selectNodeContents(inkChild);
      var inkRect = inkRange.getBoundingClientRect();
      if (inkRect.width <= 0 || inkRect.height <= 0) continue;
      left = Math.min(left, inkRect.left);
      top = Math.min(top, inkRect.top);
      right = Math.max(right, inkRect.right);
      bottom = Math.max(bottom, inkRect.bottom);
    }
    if (left === Infinity) return null;
    var slackX = elementRect.width - (right - left);
    var slackY = elementRect.height - (bottom - top);
    if (slackX < INK_BOX_MIN_SLACK_PX && slackY < INK_BOX_MIN_SLACK_PX) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  // A TEXT THAT FILLS ITS OWN BOX HAS ITS GROUND OUTSIDE IT. Its box edge carries its own strokes, so when the box
  // paints nothing of its own the pixel ring is read just outside it. A box that paints or holds text beside it, such
  // as a swatch, is left out of that ring. Paint that reaches into the box keeps the old ring at the box edge.
  var GROUND_RING_PX = ${String(SAMPLE_RING_MAX_PX)};
  function overlapsBox(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  function paintsOrHoldsText(n) {
    if (n.localName === "svg" || n.matches(REPLACED_ART_SELECTOR) || (n.textContent || "").trim() !== "") return true;
    var ns = getComputedStyle(n);
    var nbg = parseRgb(ns.backgroundColor);
    if ((nbg !== null && nbg.a > 0) || (ns.backgroundImage || "none") !== "none") return true;
    return ["Top", "Right", "Bottom", "Left"].some(function (side) {
      return Number.parseFloat(ns["border" + side + "Width"]) > 0 && ns["border" + side + "Style"] !== "none";
    });
  }
  var groundMarksOf = function (element, elementStyle, elementRect) {
    var ownFill = parseRgb(elementStyle.backgroundColor);
    if ((ownFill !== null && ownFill.a > 0) || (elementStyle.backgroundImage || "none") !== "none") return null;
    var ring = {
      left: elementRect.left - GROUND_RING_PX,
      top: elementRect.top - GROUND_RING_PX,
      right: elementRect.right + GROUND_RING_PX,
      bottom: elementRect.bottom + GROUND_RING_PX,
    };
    var scope = element.parentElement;
    while (scope !== null && scope !== document.body) {
      var scopeRect = scope.getBoundingClientRect();
      if (scopeRect.left <= ring.left && scopeRect.top <= ring.top && scopeRect.right >= ring.right && scopeRect.bottom >= ring.bottom) break;
      scope = scope.parentElement;
    }
    var marks = [];
    var nearby = (scope || document.body).querySelectorAll("*");
    for (var gm = 0; gm < nearby.length; gm += 1) {
      var near = nearby[gm];
      if (near === element || near.contains(element) || element.contains(near) || !isVisible(near)) continue;
      var nearRect = near.getBoundingClientRect();
      if (!overlapsBox(nearRect, ring) || !paintsOrHoldsText(near)) continue;
      // Paint that reaches the text's own box may be its ground, which a ring outside the box cannot see.
      if (overlapsBox(nearRect, elementRect)) return null;
      marks.push({ x: nearRect.x, y: nearRect.y, width: nearRect.width, height: nearRect.height });
    }
    return marks;
  };

  // A RUN SET ON ONE LINE AND CUT THERE has no line return, so the measure rule has nothing to judge. Each
  // half is measured, never inferred from a class: the computed style must forbid a second line (no-wrap
  // with this element's own inline clip, or a one-line clamp), the style must actually CUT something (a
  // styled line that fits is an ordinary long line and stays judged), and the element must paint exactly
  // one line box. A clamp lays out its hidden lines, so painted boxes are only those inside the element's rect.
  var lineRange = document.createRange();
  var lineBoxCount = function (element, elementRect) {
    lineRange.selectNodeContents(element);
    var boxes = [].slice.call(lineRange.getClientRects()).filter(function (box) {
      if (box.width <= 0 || box.height <= 0) return false;
      return elementRect === null || (box.bottom > elementRect.top + 0.5 && box.top < elementRect.bottom - 0.5);
    });
    boxes.sort(function (a, b) { return a.top - b.top; });
    var lines = 0;
    var lineBottom = -Infinity;
    for (var lb = 0; lb < boxes.length; lb += 1) {
      if (boxes[lb].top >= lineBottom - 0.5) {
        lines += 1;
        lineBottom = boxes[lb].bottom;
      } else {
        lineBottom = Math.max(lineBottom, boxes[lb].bottom);
      }
    }
    return lines;
  };
  var singleLineTruncated = function (element, elementStyle, elementRect) {
    var noWrap = elementStyle.whiteSpace === "nowrap" || elementStyle.whiteSpace === "pre" || elementStyle.textWrapMode === "nowrap";
    var clipsInline = elementStyle.overflowX === "hidden" || elementStyle.overflowX === "clip";
    var clampedToOne = elementStyle.webkitLineClamp === "1" || elementStyle.lineClamp === "1";
    var cutInline = noWrap && clipsInline && element.scrollWidth > element.clientWidth;
    // A clamp hides its extra lines only under a block clip; without one every line paints.
    var clipsBlock = elementStyle.overflowY === "hidden" || elementStyle.overflowY === "clip";
    var cutByClamp = clampedToOne && clipsBlock && lineBoxCount(element, null) > 1;
    if (!cutInline && !cutByClamp) return false;
    return lineBoxCount(element, elementRect) === 1;
  };

  // A LOOPING OPACITY ANIMATION IS JUDGED AT REST. The pixel pass shoots with Playwright's animations:"disabled",
  // which cancels an infinite animation to its base value and plays it again, so the glyph's opacity is read the
  // same way: cancel, read, play, and put the phase back. One frame of a pulse never decides the ratio.
  var loopingOpacity = new Map();
  var pageAnimations = typeof document.getAnimations === "function" ? document.getAnimations() : [];
  for (var la = 0; la < pageAnimations.length; la += 1) {
    var laEffect = pageAnimations[la].effect;
    if (pageAnimations[la].playState !== "running" || !laEffect || !(laEffect.target instanceof Element) || laEffect.pseudoElement) continue;
    if (laEffect.getTiming().iterations !== Infinity) continue;
    if (!laEffect.getKeyframes().some(function (frame) { return frame.opacity !== undefined; })) continue;
    var laTargetAnimations = loopingOpacity.get(laEffect.target) || [];
    laTargetAnimations.push(pageAnimations[la]);
    loopingOpacity.set(laEffect.target, laTargetAnimations);
  }
  var restingOwnOpacity = new Map();
  function ownOpacityAtRest(n) {
    var known = restingOwnOpacity.get(n);
    if (known !== undefined) return known;
    var animations = loopingOpacity.get(n) || [];
    var phases = animations.map(function (animation) { return animation.currentTime; });
    animations.forEach(function (animation) { animation.cancel(); });
    var raw = getComputedStyle(n).opacity;
    animations.forEach(function (animation, ai) {
      animation.play();
      animation.currentTime = phases[ai];
    });
    var own = raw === "" ? 1 : Number(raw);
    if (Number.isNaN(own)) own = 1;
    restingOwnOpacity.set(n, own);
    return own;
  }
  function restingOpacity(el) {
    var animated = false;
    for (var ra = el; ra !== null && !animated; ra = ra.parentElement) animated = loopingOpacity.has(ra);
    if (!animated) return accumulatedOpacity(el);
    var resting = 1;
    for (var rn = el; rn !== null; rn = rn.parentElement) resting *= ownOpacityAtRest(rn);
    return resting;
  }

  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var node;
  while ((node = walker.nextNode())) {
    if (!node.textContent || node.textContent.trim().length === 0) continue;
    var el = node.parentElement;
    if (!el || seenTextEls.has(el)) continue;
    // THE VISUAL FAMILY DOES NOT SKIP aria-hidden (issue #253). Pixels do not care about the
    // accessibility tree: an aria-hidden paragraph still renders at its size, its tracking and its measure,
    // and a sighted user reads every one of them. This collector feeds ONLY visual verdicts — contrast and
    // gray-on-color off \`texts\`, the type/leading/tracking/line-length family off \`textStyles\` — so the
    // gating here is visibility and geometry alone. Every NAME/target/repeat family keeps its own
    // aria-hidden skip (the tap-target census, the interactive census, the repeat-group census below),
    // which is where the attribute genuinely decides the verdict. The flag rides along so a future
    // a11y-flavoured rule over these samples can exclude it explicitly rather than by omission.
    if (isDevChrome(el)) continue;
    if (!isRendered(el)) continue;
    var ariaHidden = !!el.closest("[aria-hidden='true']");
    // #624 — the WCAG 1.4.3 inactive-control exemption, via the ONE shared classifier. This file's
    // no-dollar-brace convention is about stray sequences in the RAW page JS; this is a deliberate
    // interpolation of a tooling constant, the same shape snap's own contrast script already uses, and it
    // is what makes "one home" literally true across two instruments that each build their script as a
    // STRING. Re-spelling the selector here is exactly the drift that let design-audit file a P1 at 2.64:1
    // on an element snap reported as SKIPPED.
    var inactiveKind = ${INACTIVE_KIND_EXPR};
    seenTextEls.add(el);
    textEls.push(el);
    var style = getComputedStyle(el);
    var color = parseRgb(style.color);
    var fontSizePx = Number.parseFloat(style.fontSize) || 16;
    var fwRaw = style.fontWeight;
    var fontWeight = fwRaw === "bold" ? 700 : fwRaw === "normal" ? 400 : Number(fwRaw) || 400;
    var textHidden = isVisuallyHidden(el);
    if (color && !textHidden) {
      // The VIEWPORT-coordinate box rides along for one reason: an "unresolved" backdrop is settled back in
      // Node by sampling the element's real pixels out of one screenshot, and a sample needs a box. It is
      // carried on every text sample rather than only the unresolved ones so the sample shape stays uniform.
      var textRect = el.getBoundingClientRect();
      var textBackdrop = resolveTextBackdrop(el);
      var textInkBox = textBackdrop.kind === "unresolved" ? inkBoxOf(el, textRect) : null;
      var textGroundMarks = textBackdrop.kind === "unresolved" && textInkBox === null ? groundMarksOf(el, style, textRect) : null;
      texts.push({
        inkBox: textInkBox === null ? undefined : textInkBox,
        groundMarks: textGroundMarks === null ? undefined : textGroundMarks,
        selector: describe(el),
        color: { r: color.r, g: color.g, b: color.b },
        backdrop: textBackdrop,
        fontSizePx: fontSizePx,
        fontWeight: fontWeight,
        foregroundOpacity: restingOpacity(el),
        foregroundMasked: hasMaskedAncestor(el),
        box: { x: textRect.x, y: textRect.y, width: textRect.width, height: textRect.height },
        occludedBy: textBackdrop.kind === "unresolved" ? occluderOf(el) : null,
        clippedOut: textBackdrop.kind === "unresolved" ? clippedOut(el, textRect) : undefined,
        ariaHidden: ariaHidden,
        inactive: inactiveKind,
      });
    }

    // typography facts (impeccable quality family — verdicts in checks)
    var tag = el.tagName.toLowerCase();
    var rect = el.getBoundingClientRect();
    var direct = directTextOf(el);
    var lineH = Number.parseFloat(style.lineHeight);
    var letterS = Number.parseFloat(style.letterSpacing);
    // "interactive" means THE CONTROL'S PRIMARY LABEL, not any text inside an interactive
    // ancestor: a micro-voice caption inside a large clickable card is the RATIFIED gloss voice
    // (density spec §2.3), while a control whose whole label is this text owes the 11px floor.
    // Primary ≈ this element's direct text is (nearly) all the text the control has.
    var textFont = (style.fontStyle || "normal") + " " + (style.fontWeight || "400") + " " + style.fontSize + " " + style.fontFamily;
    var interactiveAnc = el.closest(INTERACTIVE_CTX);
    var interactivePrimary = false;
    if (interactiveAnc) {
      var ancTextLen = (interactiveAnc.textContent || "").replace(/\\s+/g, " ").trim().length;
      interactivePrimary = direct.length >= ancTextLen - 8;
    }
    var localMicro = tierSanctioned(el, "font-size", ${JSON.stringify(TOKENS["text.micro"].cssVar)});
    textStyles.push({
      selector: describe(el),
      // AUTHORED IDENTITY, the same pair #983 gave tap-target — a type-floor breach is a property of
      // the COMPONENT, not of each render. These are only in scope here because
      // WALKER_TARGET_IDENTITY sits ahead of this segment; the helpers read \`var\` constants that
      // hoist UNDEFINED, so function hoisting alone would NOT have saved a later placement. The full
      // reasoning is walker.ts's ORDER note, and it is the one thing that makes this line safe.
      authoredTarget: authoredTargetClaim(el),
      authoredHome: authoredTargetHome(el),
      tag: tag,
      directTextLen: direct.length,
      // The element's OWN text, capped. Carried for #652: a bounding SENTENCE and a qualifier FRAGMENT
      // are the same length-class, and only the terminal punctuation tells them apart — a fact the walker
      // gathers and the Node side judges, rather than a shape verdict taken in the page.
      directText: direct.slice(0, 120),
      totalTextLen: (el.textContent || "").trim().length,
      fontSizePx: fontSizePx,
      rampFloorPx: localMicro === null ? undefined : Number.parseFloat(localMicro.resolved),
      lineHeightPx: Number.isNaN(lineH) ? null : lineH,
      letterSpacingPx: Number.isNaN(letterS) ? 0 : letterS,
      textTransform: style.textTransform || "",
      // RENDERED caps, whichever way they were authored: a label typed "SESSION SUMMARY" paints the same
      // pixels as one transformed to caps, and the tracking rule judges pixels (issue #148 item 4).
      // Cased letters only — digits/punctuation/CJK carry no case and must not read as "caps".
      capsText: /[A-Za-z\\u00C0-\\u024F]/.test(direct) && direct === direct.toUpperCase(),
      textAlign: style.textAlign || "",
      hyphens: style.hyphens || style.webkitHyphens || "",
      rectWidth: rect.width,
      // The rendered advance of one '0' in THIS element's font — the CSS \`ch\` unit, measured. 0 means
      // the canvas refused (no 2d context), which the check reads as "no verdict", never as "narrow".
      chWidthPx: chWidthOf(textFont),
      // The law-character denominator, over the element's WHOLE rendered run (its own text nodes plus its
      // inline children's — that is what wraps inside the box), whitespace-collapsed the same way.
      glyphAdvancePx: glyphAdvanceOf(textFont, (el.textContent || "").replace(/\\s+/g, " ").trim()),
      // The transcript takes the WIDER of the two reading measures (#1145) and is judged in its token's
      // own unit; every other reading surface takes the prose measure. Interpolated from the ONE home in
      // lib/checks-typography.ts, never re-spelled here.
      readingSurface: !!el.closest(${TRANSCRIPT_SURFACE_SELECTOR_JS}),
      singleLineTruncated: singleLineTruncated(el, style, rect),
      isProseTag: QUALITY_TEXT_TAGS[tag] === 1,
      isHeading: HEADING_TAGS[tag] === 1,
      interactive: interactivePrimary,
      codeContext: !!el.closest(CODE_CTX),
      // Screen-reader-only text, from the ONE predicate (core.ts's \`srOnlyText\`, #1156) — both shapes,
      // one spelling, shared with the grid census's Law-4 population. \`=== true\` is deliberate: this
      // sample field is a BOOLEAN by contract and the typography rules read it as an EXCLUSION, so an
      // unreadable box (null) must stay in the judged population here rather than silently leave it.
      // The refusing arm belongs to the rules whose whole population turns on the predicate.
      srOnly: srOnlyText(el, rect) === true,
      ariaHidden: ariaHidden,
      // #652 — the app's own authored INTENT plus enough tree to compare two nodes in one block.
      voice: voiceOf(el),
      // The element's OWN voice, uninherited — line-length's prose population widens on it (#1183) and an
      // inherited voice would enrol every nested span of a voiced paragraph as its own reading line.
      ownVoice: el.getAttribute("data-voice") || "",
      alertContext: alertCarrierOf(el, style),
      alertRegion: !!el.closest(CAVEAT_ROLE_CTX),
      blockPath: blockPathOf(el),
    });

    // Keep font faces and the size set as raw page evidence; the face classifier reads the token stacks.
    // Each face keeps the first element that declares it without previewing it, so a finding names an owner.
    var stack = (style.fontFamily || "").split(",");
    for (var fi = 0; fi < stack.length; fi += 1) {
      var face = stack[fi].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
      if (!face || GENERIC_FONTS[face] === 1) continue;
      var previewed = (el.getAttribute(FONT_PREVIEW_ATTRIBUTE) || "").trim().replace(/^['"]|['"]$/g, "").toLowerCase() === face;
      var faceSeen = fontFamilies[face] || (fontFamilies[face] = { selector: null });
      if (!previewed && faceSeen.selector === null) faceSeen.selector = describe(el);
      break;
    }
    if (fontSizePx >= 8 && fontSizePx < 200) fontSizes[String(Math.round(fontSizePx * 10) / 10)] = 1;
  }

  // ── FACE AVAILABILITY: what the page can PAINT, not what it declares (#23) ──────────────────────
  // The census above gathers each element's FIRST NON-GENERIC DECLARED face, and that is a CASCADE fact:
  // font loading cannot move it (no CSSOM exposes the USED face), so a page whose brand webfont never
  // ships still reports the brand name and off-theme-font reads CLEAN on exactly the defect it names.
  // document.fonts.check cannot close that hole either — for a family with no registered @font-face the
  // spec makes check() VACUOUSLY TRUE (measured on this tree: check("16px ZzzNotAFont") === true, with
  // document.fonts holding zero Geist faces). Glyph metrics can: a family the browser cannot resolve
  // falls through to the base generic and measures exactly like a family that provably does not exist.
  var FACE_PROBE_TEXT = "mmmmmmmmmmlliWWWQQQ0123456789";
  var FACE_PROBE_BASES = ["monospace", "serif", "sans-serif"];
  var FACE_PROBE_ABSENT = "__orb_no_such_face__";
  var faceCtx = document.createElement("canvas").getContext("2d");
  var faceWidthOver = function (family, base) {
    faceCtx.font = '72px "' + family.replace(/"/g, "") + '", ' + base;
    return faceCtx.measureText(FACE_PROBE_TEXT).width;
  };
  var faceBaseWidth = {};
  var faceProbeUsable = false;
  if (faceCtx) {
    for (var fb = 0; fb < FACE_PROBE_BASES.length; fb += 1) {
      faceCtx.font = "72px " + FACE_PROBE_BASES[fb];
      faceBaseWidth[FACE_PROBE_BASES[fb]] = faceCtx.measureText(FACE_PROBE_TEXT).width;
    }
    // THE TWO-SIDED CONTROL RUNS EVERY RUN, not only in a fixture. POSITIVE: the browser's own serif face
    // must measure DIFFERENTLY from the monospace base — a probe that cannot tell two PRESENT faces apart
    // would report every face absent and blind the rule a second way. NEGATIVE: a family that cannot
    // exist must measure exactly its base on every base — if it reads as present the probe discriminates
    // nothing. Either control failing leaves probeUsable false, and the Node side WITHHOLDS the token-face
    // verdict rather than publishing a pass it did not measure.
    var faceProbeSeesPresent = faceWidthOver("serif", "monospace") !== faceBaseWidth["monospace"];
    var faceProbeSeesAbsent = true;
    for (var fc = 0; fc < FACE_PROBE_BASES.length; fc += 1) {
      if (faceWidthOver(FACE_PROBE_ABSENT, FACE_PROBE_BASES[fc]) !== faceBaseWidth[FACE_PROBE_BASES[fc]]) faceProbeSeesAbsent = false;
    }
    faceProbeUsable = faceProbeSeesPresent && faceProbeSeesAbsent;
  }
  var fontFaces = [];
  var declaredFaces = Object.keys(fontFamilies);
  for (var fd = 0; fd < declaredFaces.length; fd += 1) {
    var declaredFace = declaredFaces[fd];
    var facePaints = false;
    if (faceProbeUsable) {
      for (var fe = 0; fe < FACE_PROBE_BASES.length; fe += 1) {
        if (faceWidthOver(declaredFace, FACE_PROBE_BASES[fe]) !== faceBaseWidth[FACE_PROBE_BASES[fe]]) { facePaints = true; break; }
      }
    }
    var faceOwner = fontFamilies[declaredFace].selector;
    fontFaces.push({ name: declaredFace, available: facePaints, selector: faceOwner === null ? undefined : faceOwner, previewOnly: faceOwner === null });
  }

  // ── images (<img> + non-cover/contain background-image) ─────────────────
  var images = [];
  var brokenImages = [];
  var imgEls = document.querySelectorAll("img");
  for (var i = 0; i < imgEls.length; i += 1) {
    var img = imgEls[i];
    if (isDevChrome(img)) continue;
    if (img.closest("[aria-hidden='true']")) {
      walkerProvenTally("broken-image", { kind: "excluded", reason: "decorative" });
    } else {
      var srcAttr = img.getAttribute("src");
      if (srcAttr === null || srcAttr.trim() === "") {
        walkerProvenTally("broken-image", "judged");
        brokenImages.push({ selector: describe(img), reason: "empty-src" });
      } else if (img.complete) {
        walkerProvenTally("broken-image", "judged");
        if (img.naturalWidth === 0) brokenImages.push({ selector: describe(img), reason: "failed-load" });
      } else if (img.loading === "lazy" && !inVisualViewport(img.getBoundingClientRect())) {
        // The browser deferred the request by design; nothing is painted yet, so there is nothing broken to see.
        walkerProvenTally("broken-image", { kind: "excluded", reason: "lazyDeferred" });
      } else {
        walkerProvenTally("broken-image", { kind: "withheld", reason: "imageNotLoaded" });
      }
    }
    if (!isVisible(img) || !img.complete || img.naturalWidth === 0) continue;
    var rect2 = img.getBoundingClientRect();
    images.push({
      selector: describe(img),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: rect2.width,
      renderedHeight: rect2.height,
      objectFit: getComputedStyle(img).objectFit || "fill",
    });
  }
  var bgCandidates = [];
  // allEls is the exact walked subject set captured in core.ts before any family ran (#976).
  for (var j = 0; j < allEls.length; j += 1) {
    var bel = allEls[j];
    var bstyle = getComputedStyle(bel);
    var bgImg = bstyle.backgroundImage;
    if (!bgImg || bgImg === "none" || bgImg.indexOf("gradient") !== -1) continue;
    var sizeVal = bstyle.backgroundSize;
    if (sizeVal === "cover" || sizeVal === "contain") continue;
    var urlMatch = BG_URL_RE.exec(bgImg);
    if (!urlMatch || !isVisible(bel)) continue;
    // Every axis "auto" (the CSS default — a bare "auto" shorthand expands to "auto auto") paints at
    // natural size and cannot squish; anything else carries an explicit length/percentage on at least
    // one axis and CAN distort (#1825).
    var sizeTokens = sizeVal.trim().split(/\\s+/);
    var bgSizeMode = sizeTokens.every(function (tok) { return tok === "auto"; }) ? "auto" : "scales";
    bgCandidates.push({ el: bel, url: urlMatch[2], rect: bel.getBoundingClientRect(), sizeMode: bgSizeMode });
  }
  for (var k = 0; k < bgCandidates.length; k += 1) {
    var cand = bgCandidates[k];
    var natural = await loadNaturalSize(cand.url);
    if (!natural) continue;
    images.push({
      selector: describe(cand.el),
      naturalWidth: natural.w,
      naturalHeight: natural.h,
      renderedWidth: cand.rect.width,
      renderedHeight: cand.rect.height,
      // background-size cover/contain already excluded candidate collection above (non-stretching by
      // definition); "fill" here is a neutral placeholder so the shared distortion check still applies.
      objectFit: "fill",
      backgroundSizeMode: cand.sizeMode,
    });
  }

  // ── buried raster (img/background-image painting below ~0.15 effective opacity) ────────────
  // RUNTIME ARM ONLY of pbakaus/impeccable's buried-raster recipe (cli/engine/rules/checks.mjs,
  // checkQuality — Copyright 2025 Paul Bakaus, Apache License 2.0): a raster carrier that PAINTS
  // something (display/visibility/geometry all live — a display:none/visibility:hidden subtree is a
  // different defect class and is excluded here, never judged as buried) but composites at an
  // accumulated opacity so low the material never reaches the screen. The 0.15 threshold and the
  // verdict live Node-side (lib/checks-media.ts); this segment only gathers the candidate, its
  // accumulated opacity, and whether its OWN transition-property could still raise it later (a
  // mid-entrance reveal, not a resting bury — checks-media.ts owns why that EXCLUDES rather than fires).
  var buriedCandidates = [];
  for (var bi = 0; bi < imgEls.length; bi += 1) {
    var bimg = imgEls[bi];
    if (isDevChrome(bimg)) continue;
    var bimgSrc = bimg.getAttribute("src");
    if (!bimgSrc || bimgSrc.trim() === "") continue;
    var bimgStyle = getComputedStyle(bimg);
    if (bimgStyle.display === "none" || bimgStyle.visibility === "hidden") continue;
    var bimgRect = bimg.getBoundingClientRect();
    if (bimgRect.width <= 0 || bimgRect.height <= 0) continue;
    buriedCandidates.push({ el: bimg, kind: "img" });
  }
  for (var bj = 0; bj < allEls.length; bj += 1) {
    var bel2 = allEls[bj];
    if (isDevChrome(bel2)) continue;
    var bstyle2 = getComputedStyle(bel2);
    var bgImg2 = bstyle2.backgroundImage;
    if (!bgImg2 || bgImg2 === "none" || bgImg2.indexOf("gradient") !== -1) continue;
    if (!BG_URL_RE.test(bgImg2)) continue;
    if (bstyle2.display === "none" || bstyle2.visibility === "hidden") continue;
    var bRect2 = bel2.getBoundingClientRect();
    if (bRect2.width <= 0 || bRect2.height <= 0) continue;
    buriedCandidates.push({ el: bel2, kind: "background" });
  }
  var buriedRasters = [];
  for (var bk = 0; bk < buriedCandidates.length; bk += 1) {
    var bc = buriedCandidates[bk];
    var bcTransProps = (getComputedStyle(bc.el).transitionProperty || "").split(",");
    var bcOpacityTransitions = false;
    for (var bt = 0; bt < bcTransProps.length; bt += 1) {
      var bcProp = bcTransProps[bt].replace(/^\\s+|\\s+$/g, "");
      if (bcProp === "opacity" || bcProp === "all") { bcOpacityTransitions = true; break; }
    }
    buriedRasters.push({
      selector: describe(bc.el),
      kind: bc.kind,
      effectiveOpacity: accumulatedOpacity(bc.el),
      opacityTransitions: bcOpacityTransitions,
    });
  }

`;
