// ui-audit in-page walker — segment: the text/contrast/typography TreeWalker census + the image census (img + non-cover background-image).
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { INACTIVE_KIND_EXPR } from "../../../_shared/wcag.ts";
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
  var texts = [];
  var textStyles = [];
  var fontFamilies = {};
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
  var blockPathOf = function (element) {
    var path = [];
    var anc = element.parentElement;
    for (var bl = 0; bl < BLOCK_ANCESTOR_LEVELS && anc !== null; bl += 1) {
      path.push(blockIdOf(anc));
      anc = anc.parentElement;
    }
    return path;
  };
  var voiceOf = function (element) {
    var own = element.getAttribute("data-voice");
    if (own) return own;
    var carrier = element.closest("[data-voice]");
    return carrier ? carrier.getAttribute("data-voice") || "" : "";
  };

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
    if (!isVisible(el)) continue;
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
      var textBackdrop = resolveBackdrop(el);
      texts.push({
        selector: describe(el),
        color: { r: color.r, g: color.g, b: color.b },
        backdrop: textBackdrop,
        fontSizePx: fontSizePx,
        fontWeight: fontWeight,
        foregroundOpacity: accumulatedOpacity(el),
        foregroundMasked: hasMaskedAncestor(el),
        box: { x: textRect.x, y: textRect.y, width: textRect.width, height: textRect.height },
        occludedBy: textBackdrop.kind === "unresolved" ? occluderOf(el) : null,
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
      alertContext: !!el.closest(CAVEAT_ROLE_CTX),
      blockPath: blockPathOf(el),
    });

    // page censuses (impeccable overused-font/flat-type-hierarchy recipe, family list rebound
    // to our token stacks in checks)
    var stack = (style.fontFamily || "").split(",");
    for (var fi = 0; fi < stack.length; fi += 1) {
      var face = stack[fi].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
      if (face && GENERIC_FONTS[face] !== 1) { fontFamilies[face] = 1; break; }
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
    fontFaces.push({ name: declaredFace, available: facePaints });
  }

  // ── images (<img> + non-cover/contain background-image) ─────────────────
  var images = [];
  var brokenImages = [];
  var imgEls = document.querySelectorAll("img");
  for (var i = 0; i < imgEls.length; i += 1) {
    var img = imgEls[i];
    if (isDevChrome(img)) continue;
    if (!img.closest("[aria-hidden='true']")) {
      var srcAttr = img.getAttribute("src");
      if (srcAttr === null || srcAttr.trim() === "") {
        brokenImages.push({ selector: describe(img), reason: "empty-src" });
      } else if (img.complete && img.naturalWidth === 0) {
        brokenImages.push({ selector: describe(img), reason: "failed-load" });
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
    bgCandidates.push({ el: bel, url: urlMatch[2], rect: bel.getBoundingClientRect() });
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
