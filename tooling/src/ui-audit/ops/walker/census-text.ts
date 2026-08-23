// ui-audit in-page walker — segment: the text/contrast/typography TreeWalker census + the image census (img + non-cover background-image).
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_CENSUS_TEXT = `
  // ── text / contrast / typography ─────────────────────────────────────────
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
        box: { x: textRect.x, y: textRect.y, width: textRect.width, height: textRect.height },
        occludedBy: textBackdrop.kind === "unresolved" ? occluderOf(el) : null,
        ariaHidden: ariaHidden,
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
    var interactiveAnc = el.closest(INTERACTIVE_CTX);
    var interactivePrimary = false;
    if (interactiveAnc) {
      var ancTextLen = (interactiveAnc.textContent || "").replace(/\\s+/g, " ").trim().length;
      interactivePrimary = direct.length >= ancTextLen - 8;
    }
    textStyles.push({
      selector: describe(el),
      tag: tag,
      directTextLen: direct.length,
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
      chWidthPx: chWidthOf((style.fontStyle || "normal") + " " + (style.fontWeight || "400") + " " + style.fontSize + " " + style.fontFamily),
      isProseTag: QUALITY_TEXT_TAGS[tag] === 1,
      isHeading: HEADING_TAGS[tag] === 1,
      interactive: interactivePrimary,
      codeContext: !!el.closest(CODE_CTX),
      // Screen-reader-only text, either shape: the CLIPPED state (isVisuallyHidden — the real
      // \`sr-only\` posture, which keeps a full-size box) or a sub-2px plumbing box.
      srOnly: textHidden || (rect.width <= 2 && rect.height <= 2),
      ariaHidden: ariaHidden,
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
  // ONE dev-chrome filter for every element-driven sweep below (see DEV_CHROME_SEL).
  var allEls = [].filter.call(document.querySelectorAll("*"), function (candidate) {
    return !isDevChrome(candidate);
  });
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

`;
