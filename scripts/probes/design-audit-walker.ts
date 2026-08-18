// The design-audit IN-PAGE FACT WALKER — a raw JS string evaluated in the probe page (see
// _kit/browser.ts for why a string, not a function). It only GATHERS raw samples
// (computed-style values, geometry, censuses); every severity/threshold verdict lives in
// design-audit-checks.ts so the decisions stay unit-testable without a browser. The few
// walker-side predicates (nested-card shape, gradient-text shape, overshoot beziers,
// structural-signature grouping) are bounded FACT filters following the original walker's
// nestedCards/gradientTexts precedent — their verdicts are still pass-throughs in checks.
//
// PROVENANCE / ATTRIBUTION: the sample families marked "impeccable" below adapt detection
// recipes from pbakaus/impeccable (https://github.com/pbakaus/impeccable,
// cli/engine/rules/checks.mjs — Copyright 2025 Paul Bakaus, Apache License 2.0). The code is
// re-written for this walker's raw-facts-only architecture and MODIFIED against orbweaver law
// (token-ramp bindings, sanctioned-effect exemptions) — see
// .claude/skills/side-eye-design-review/reference/impeccable-adoption.md for the full 59-rule
// triage, the divergences, and the license statement.

// ── In-page fact walker (raw string, not a function reference — see _kit/browser.ts) ──
export const COLLECT_SAMPLES_JS = `(async () => {
  var INTERACTIVE_SELECTOR = "a,button,[role=button],input,select,[tabindex]";
  var CARD_CLASS_RE = /\\bcard\\b/i;
  var EXCLUDE_CARD_CONTEXT_RE = /\\b(dropdown|popover|tooltip|menu|modal|dialog)\\b/i;
  var HOVER_TRANSFORM_RE = /transform\\s*:\\s*(scale|rotate|translate|skew|matrix)/i;
  var TAILWIND_HOVER_TRANSFORM_RE = /^hover:(scale|rotate|translate-x|translate-y|skew-x|skew-y)-/;
  var BG_URL_RE = /url\\((['"]?)(.*?)\\1\\)/;
  var RGB_RE = /rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*(?:,\\s*([\\d.]+))?\\)/;
  var COLOR_STOP_RE = /rgba?\\([^)]+\\)|#[0-9a-fA-F]{3,8}/g;
  // Interactive/code contexts for the type-floor checks (impeccable undersized-ui-text).
  var INTERACTIVE_CTX = "a[href],button,summary,label,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],[tabindex]";
  var CODE_CTX = "pre,code,kbd,samp,var,svg,[aria-hidden='true']";
  // Sanctioned radial-glow carriers (owner effect axes — ui/src/styles/globals.css): the
  // empty-state aura, the media-grid pointer spotlight, the brand loader glow.
  var SANCTIONED_GLOW_SEL = "[data-slot='empty-state-decoration'],[data-slot='media-grid-cell'],.orb-weave-glow";
  // Dev-only tooling chrome (TanStack devtools trigger/panel, react-query devtools, the vite
  // error overlay) is NOT product surface — it z-index-escalates and root-clips by design and
  // was the measured FP source on every run. Skip its subtree everywhere.
  var DEV_CHROME_SEL = "#tanstack_devtools,#tsqd-parent-container,vite-error-overlay";
  // The devtools TRIGGER button floats in bare divs outside #tanstack_devtools but carries a
  // goober CSS-in-JS class (go<digits>) — the app itself is Tailwind-only, so goober = devtools.
  var GOOBER_CLASS_RE = /(^|\\s)go\\d+(\\s|$)/;
  function isDevChrome(el) {
    if (el.closest && el.closest(DEV_CHROME_SEL)) return true;
    return typeof el.className === "string" && GOOBER_CLASS_RE.test(el.className);
  }
  // Motion-law sanctioned measured-var height panels (motion guide §3.7).
  var PANEL_EXEMPT_SEL = "[data-slot='accordion-panel'],[data-slot='collapsible-panel']";
  var HEADING_TAGS = { h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1 };
  var BORDER_SAFE_TAGS = { a: 1, button: 1, input: 1, select: 1, textarea: 1, option: 1, hr: 1, table: 1, thead: 1, tbody: 1, tr: 1, td: 1, th: 1, fieldset: 1 };
  var QUALITY_TEXT_TAGS = { p: 1, li: 1, td: 1, th: 1, dd: 1, blockquote: 1, figcaption: 1 };
  var GENERIC_FONTS = { "sans-serif": 1, serif: 1, monospace: 1, cursive: 1, fantasy: 1, "system-ui": 1, "ui-sans-serif": 1, "ui-serif": 1, "ui-monospace": 1, "ui-rounded": 1, emoji: 1, math: 1, fangsong: 1 };

  // A finding nobody can LOCATE is not a finding. The old describe() emitted a single
  // tag.class:nth-of-type(n) step, and nth-of-type counts only among an element's own siblings — so
  // fifteen buttons under fifteen different parents all reported the identical
  // button.group:nth-of-type(1) in one audit and none of them could be found. Build a PATH up to the
  // nearest stable anchor (id / data-testid / data-slot / body) instead.
  //
  // AN ANCHOR IS ONLY AN ANCHOR IF IT RESOLVES TO ONE NODE (2026-08-17, issue #148 item 5). data-slot
  // names a component KIND, not an element: a live tracker-panel audit returned six findings reading
  // [data-slot=text] and one [data-slot=button], indistinguishable from each other and from the dozens
  // of untouched twins — two real text-overflow defects went unforwardable. Every candidate anchor is now
  // COUNTED in the document (memoized per selector) and only used when it matches exactly once; otherwise
  // the walk keeps climbing and the slot rides along as a qualifier on the local step.
  // (NB: this whole module body is a template LITERAL — no backticks, no dollar-brace, ever.)
  var DESCRIBE_MAX_STEPS = 6;
  // A class/attribute value safe to paste into a selector unescaped. Tailwind mints plenty that are not
  // ("w-1/2", "h-[3px]") — an unescaped one produces a selector that THROWS instead of finding nothing.
  var CSS_IDENT_RE = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;
  // React/Base UI GENERATED ids (useId: "«r6a»", ":r6a:", and Base UI's "base-ui-_r_6a_") are unique but
  // RE-MINTED every mount — a path anchored on one resolves to nothing in the next session, which is a
  // finding a reviewer cannot re-open. Climb past them to something structural.
  var VOLATILE_ID_RE = /(«r[0-9a-z]+»|:r[0-9a-z]+:|_r_[0-9a-z]+_)/i;
  var anchorMatchCounts = {};
  function matchCount(sel) {
    var known = anchorMatchCounts[sel];
    if (known !== undefined) return known;
    var n = 0;
    try { n = document.querySelectorAll(sel).length; } catch (e) { n = 0; }
    anchorMatchCounts[sel] = n;
    return n;
  }
  function attrSel(name, value) {
    return "[" + name + "=" + (CSS_IDENT_RE.test(value) ? value : JSON.stringify(value)) + "]";
  }
  function localStep(el) {
    var tag = el.tagName ? el.tagName.toLowerCase() : "node";
    var cls = el.classList && el.classList.length > 0 && CSS_IDENT_RE.test(el.classList[0]) ? "." + el.classList[0] : "";
    var slotAttr = el.getAttribute ? el.getAttribute("data-slot") : null;
    var slot = slotAttr ? attrSel("data-slot", slotAttr) : "";
    var idx = 0;
    var sib = el;
    while (sib) {
      if (sib.tagName === el.tagName) idx += 1;
      sib = sib.previousElementSibling;
    }
    return tag + cls + slot + ":nth-of-type(" + idx + ")";
  }
  function anchorOf(el) {
    if (!el.getAttribute) return null;
    if (el.id && !VOLATILE_ID_RE.test(el.id)) {
      var idSel = "#" + el.id;
      if (matchCount(idSel) === 1) return idSel;
    }
    var testId = el.getAttribute("data-testid");
    if (testId) {
      var testSel = attrSel("data-testid", testId);
      if (matchCount(testSel) === 1) return testSel;
    }
    var slot = el.getAttribute("data-slot");
    if (slot) {
      var slotSel = attrSel("data-slot", slot);
      if (matchCount(slotSel) === 1) return slotSel;
    }
    return null;
  }
  function describe(el) {
    if (!el) return "unknown";
    var own = anchorOf(el);
    if (own) return own;
    var parts = [];
    var node = el;
    var steps = 0;
    while (node && node.nodeType === 1 && steps < DESCRIBE_MAX_STEPS) {
      if (node !== el) {
        var anchor = anchorOf(node);
        if (anchor) {
          parts.unshift(anchor);
          break;
        }
      }
      parts.unshift(localStep(node));
      if (node.tagName === "BODY") break;
      node = node.parentElement;
      steps += 1;
    }
    return parts.join(" > ");
  }

  // ACCUMULATED OPACITY over the element + its ancestors. CSS opacity GROUPS: a subtree inside
  // opacity:0.6 is rasterized and composited over what is behind it, so every glyph in it is painted
  // as a BLEND — while getComputedStyle(el).color still reports the undimmed rgb. Two consequences the
  // walker owes: text samples carry this product so the Node side can composite before the WCAG ratio
  // (issue #188 — the home surface's "waiting on:" lines measured 3.68:1 under snap's --contrast, which
  // does exactly this, while design-audit reported nothing), and a subtree under an ancestor opacity of
  // 0 paints NO pixels and must count as hidden (the old own-opacity-only test missed that, and a
  // composite of an invisible glyph would come out as a fake 1:1 finding). Memoized per element, so the
  // ancestor walk is O(1) amortized even though isVisible runs over every element.
  var opacityCache = new WeakMap();
  function accumulatedOpacity(el) {
    var known = opacityCache.get(el);
    if (known !== undefined) return known;
    var raw = getComputedStyle(el).opacity;
    var own = raw === "" ? 1 : Number(raw);
    if (Number.isNaN(own)) own = 1;
    var parent = el.parentElement;
    var value = parent === null ? own : own * accumulatedOpacity(parent);
    opacityCache.set(el, value);
    return value;
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    var style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || accumulatedOpacity(el) === 0) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // COLOR SPACE IS NOT A COLOR FORMAT (issue #188). getComputedStyle passes a non-legacy color function
  // straight through — a tokens-only codebase paints oklch(0.72 0.175 52) and reads it back verbatim —
  // so an rgb-regex-only sampler resolves null for EVERY authored color on this tree: measured live, the
  // home resume card's 3px oklch accent edge produced zero findings, and the whole color rule family
  // (contrast, gray-on-color, accent borders, card backgrounds) was silently dead. Normalize through a
  // 1x1 canvas the way snap's --contrast does: fillStyle accepts every CSS color the page can produce,
  // and painting onto a CLEARED canvas reads back un-premultiplied rgb + exact alpha in one shot.
  // Validity is a two-sentinel test — an unparseable value leaves the previous fillStyle in place, so a
  // color that survives both sentinels is one the browser actually understood.
  // (Un-premultiplication amplifies rounding error at very low alpha; every consumer here gates on the
  // ALPHA — which is exact — before trusting the channels.)
  var colorCache = {};
  var colorCanvas = document.createElement("canvas");
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  var colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true });
  function probeColor(css) {
    if (colorCtx === null) return null;
    colorCtx.fillStyle = "#000000";
    colorCtx.fillStyle = css;
    var onBlack = colorCtx.fillStyle;
    colorCtx.fillStyle = "#ffffff";
    colorCtx.fillStyle = css;
    if (onBlack !== colorCtx.fillStyle) return null;
    colorCtx.clearRect(0, 0, 1, 1);
    colorCtx.fillRect(0, 0, 1, 1);
    var d = colorCtx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  }
  function parseRgb(str) {
    var key = str || "";
    if (key === "") return null;
    var m = RGB_RE.exec(key);
    if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
    var cached = colorCache[key];
    if (cached !== undefined) return cached;
    var probed = probeColor(key);
    colorCache[key] = probed;
    return probed;
  }

  function hexToRgb(hex) {
    var h = hex.replace("#", "");
    var full = h.length === 3 ? h.split("").map(function (c) { return c + c; }).join("") : h.slice(0, 6);
    var num = Number.parseInt(full, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  // Stops now KEEP alpha (hex → 1): a translucent stop makes worst-stop contrast math a lie,
  // so the Node side refuses (image-indeterminate) instead of trusting it.
  function parseGradientStops(bgImage) {
    var stops = [];
    var m;
    COLOR_STOP_RE.lastIndex = 0;
    while ((m = COLOR_STOP_RE.exec(bgImage)) !== null) {
      var rgb = m[0][0] === "#" ? hexToRgb(m[0]) : parseRgb(m[0]);
      if (rgb) stops.push({ r: rgb.r, g: rgb.g, b: rgb.b, a: rgb.a === undefined ? 1 : rgb.a });
    }
    return stops;
  }

  // Source-over composite of a translucent layer onto an already-resolved opaque base.
  function compositeOver(layer, base) {
    var a = layer.a === undefined ? 1 : layer.a;
    return {
      r: Math.round(a * layer.r + (1 - a) * base.r),
      g: Math.round(a * layer.g + (1 - a) * base.g),
      b: Math.round(a * layer.b + (1 - a) * base.b),
    };
  }

  // Walk el then its ancestors for the effective backdrop: collect every TRANSLUCENT background down to
  // the first OPAQUE one, then paint them back bottom-up so the returned color is what the eye sees. A
  // PURE gradient background-image reports its parsed color stops (with alpha); anything with a url()
  // layer — including gradient-over-image composites — is indeterminate (no cheap DOM-only way to sample
  // the pixels under the text; the old walker trusted the gradient half of a "gradient(...), url(...)"
  // layer, which was the documented blind spot).
  //
  // A TRANSLUCENT TINT IS NOT A BACKDROP (issue #188). The rule was "first background-color with
  // alpha > 0.1 wins, alpha discarded" — so a chat list row's 10%-alpha selected tint
  // (oklab(0.72 0.108 0.138 / 0.1)) was measured as a SATURATED ORANGE surface: 1.14:1 contrast plus a
  // gray-on-color finding, both against a color nothing on screen is painted. snap's --contrast paid for
  // this exact bug already (its 1.11-vs-2.6 false FAIL) and composites; these two instruments must not
  // disagree about what is behind a glyph. It stayed invisible only because the rgb-regex sampler could
  // not parse an oklab tint in the first place.
  var OPAQUE_MIN_ALPHA = 0.999;
  function resolveBackdrop(el) {
    var node = el;
    var layers = [];
    while (node) {
      var style = getComputedStyle(node);
      var bgImage = style.backgroundImage;
      if (bgImage && bgImage !== "none") {
        if (bgImage.indexOf("gradient") !== -1 && bgImage.indexOf("url(") === -1) {
          var stops = parseGradientStops(bgImage);
          if (stops.length > 0) return { kind: "gradient", stops: stops };
        }
        return { kind: "image-indeterminate" };
      }
      var bg = parseRgb(style.backgroundColor);
      if (bg && bg.a > 0) {
        if (bg.a >= OPAQUE_MIN_ALPHA) {
          var acc = { r: bg.r, g: bg.g, b: bg.b };
          for (var li = layers.length - 1; li >= 0; li -= 1) acc = compositeOver(layers[li], acc);
          return { kind: "flat", color: acc };
        }
        layers.push(bg);
      }
      node = node.parentElement;
    }
    // No opaque base anywhere in the chain — the walker has no pixel sampler, so it keeps the historical
    // white assumption, with any translucent layers painted over it.
    var white = { r: 255, g: 255, b: 255 };
    for (var wi = layers.length - 1; wi >= 0; wi -= 1) white = compositeOver(layers[wi], white);
    return { kind: "flat", color: white };
  }

  function loadNaturalSize(url) {
    return new Promise(function (resolve) {
      var img = new Image();
      var done = false;
      var finish = function (result) {
        if (done) return;
        done = true;
        resolve(result);
      };
      img.onload = function () { finish({ w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = function () { finish(null); };
      img.src = url;
      setTimeout(function () { finish(null); }, 2000);
    });
  }

  function directTextOf(el) {
    var out = "";
    for (var dn = 0; dn < el.childNodes.length; dn += 1) {
      var n = el.childNodes[dn];
      if (n.nodeType === 3) out += n.textContent || "";
    }
    return out.replace(/\\s+/g, " ").trim();
  }

  // ── text / contrast / typography ─────────────────────────────────────────
  var texts = [];
  var textStyles = [];
  var fontFamilies = {};
  var fontSizes = {};
  var textEls = [];
  var seenTextEls = new Set();
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  var node;
  while ((node = walker.nextNode())) {
    if (!node.textContent || node.textContent.trim().length === 0) continue;
    var el = node.parentElement;
    if (!el || seenTextEls.has(el)) continue;
    if (el.closest("[aria-hidden='true']") || isDevChrome(el)) continue;
    if (!isVisible(el)) continue;
    seenTextEls.add(el);
    textEls.push(el);
    var style = getComputedStyle(el);
    var color = parseRgb(style.color);
    var fontSizePx = Number.parseFloat(style.fontSize) || 16;
    var fwRaw = style.fontWeight;
    var fontWeight = fwRaw === "bold" ? 700 : fwRaw === "normal" ? 400 : Number(fwRaw) || 400;
    if (color) {
      texts.push({
        selector: describe(el),
        color: { r: color.r, g: color.g, b: color.b },
        backdrop: resolveBackdrop(el),
        fontSizePx: fontSizePx,
        fontWeight: fontWeight,
        foregroundOpacity: accumulatedOpacity(el),
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
      isProseTag: QUALITY_TEXT_TAGS[tag] === 1,
      isHeading: HEADING_TAGS[tag] === 1,
      interactive: interactivePrimary,
      codeContext: !!el.closest(CODE_CTX),
      srOnly: rect.width <= 2 && rect.height <= 2,
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

  // ── interactive elements: tap targets + accessible names ────────────────
  var tapTargets = [];
  var accessibleNames = [];
  var interactiveEls = document.querySelectorAll(INTERACTIVE_SELECTOR);
  var labelledbyText = function (el) {
    var attr = el.getAttribute("aria-labelledby") || "";
    var ids = attr.split(/\\s+/).filter(Boolean);
    if (ids.length === 0) return null;
    var text = ids
      .map(function (id) {
        var ref = document.getElementById(id);
        return ref ? ref.textContent || "" : "";
      })
      .join(" ")
      .trim();
    return text.length > 0 ? text : null;
  };
  var altTextOf = function (el) {
    if (el.tagName === "IMG") return el.getAttribute("alt");
    var inner = el.querySelector("img[alt]");
    return inner ? inner.getAttribute("alt") : null;
  };
  // THE HIT AREA IS NOT THE BOX (2026-08-16 — 10 of 13 "sub-target" findings in one audit were this).
  // @orb/ui Button's size="inline"/size="glyph-*" variants carry a pointer-conditional touch-target
  // ::after (packages/ui/src/primitives/button/variants.ts:16-20, :76-82), so a 25x15 border box can own
  // a 45x45 hit area. Probe what the COMPOSITOR says: sample points on the ring the ::after would cover
  // and ask elementFromPoint whether this control still owns them. The measured extent is what WCAG
  // 2.5.5/2.5.8 are about — "target size", not "border-box size".
  var HIT_PROBE_RADII = [11, 16, 22]; // half-extents probed outward: 22 → a 44px target
  // OWNERSHIP IS PER COMPOSITE, NOT PER ELEMENT (2026-08-16). A Base UI Slider's real pointer target is
  // the whole Control row (h-control-sm — 44px coarse / 32px fine; a mouse press at the row's top edge
  // 60px from the thumb moved the value 60 to 73), but the outward probe lands on
  // [data-slot=slider-indicator], a SIBLING of the thumb inside the same control. The identity/containment
  // test alone stalled the walk there and printed a fine-pointer P1 at 22px on a 32px row.
  // A hit is now ALSO owned when the nearest ancestor el and hit share offers exactly ONE control and that
  // control is el — a neighbouring button IS another offered control, so a genuine sub-target still fires.
  // DECLARED LIMIT: a lone control inside a larger non-interactive wrapper within COMPOSITE_WALK_MAX levels
  // is credited with the wrapper's extent even if the wrapper takes no pointer. That direction (under-
  // reporting one sub-target) is the deliberate trade against the measured FP class: 10 of 13 "sub-target"
  // findings in one audit were hit-area misreads.
  var COMPOSITE_WALK_MAX = 4;
  // The same "is this an offered target" filter the tap-target census itself applies (aria-hidden Base UI
  // twins, dev chrome, 1-2px plumbing) — two vocabularies here would let a phantom control veto a real
  // composite.
  function isOfferedControl(el) {
    if (!isVisible(el) || isDevChrome(el)) return false;
    if (el.closest("[aria-hidden='true']")) return false;
    var r = el.getBoundingClientRect();
    return Math.min(r.width, r.height) > 2;
  }
  function sharedCompositeOwns(el, hit) {
    var scope = el.parentElement;
    for (var d = 0; d < COMPOSITE_WALK_MAX && scope !== null; d += 1) {
      if (scope.contains(hit)) {
        var controls = scope.querySelectorAll(INTERACTIVE_SELECTOR);
        for (var c = 0; c < controls.length; c += 1) {
          var other = controls[c];
          if (other !== el && !el.contains(other) && isOfferedControl(other)) return false;
        }
        return true;
      }
      scope = scope.parentElement;
    }
    return false;
  }
  function ownsPoint(el, x, y) {
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return false;
    var hit = document.elementFromPoint(x, y);
    if (hit === null) return false;
    if (hit === el || el.contains(hit) || hit.contains(el)) return true;
    return sharedCompositeOwns(el, hit);
  }
  // Grow outward from the centre while the control still answers on all four cardinal offsets. Returns
  // the effective half-extent in px (>= the box's own, never less).
  function effectiveHalfExtent(el, rect) {
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    if (!ownsPoint(el, cx, cy)) return Math.min(rect.width, rect.height) / 2; // occluded centre: trust the box
    var best = Math.min(rect.width, rect.height) / 2;
    for (var hp = 0; hp < HIT_PROBE_RADII.length; hp += 1) {
      var r = HIT_PROBE_RADII[hp];
      if (r <= best) continue;
      if (ownsPoint(el, cx - r, cy) && ownsPoint(el, cx + r, cy) && ownsPoint(el, cx, cy - r) && ownsPoint(el, cx, cy + r)) best = r;
    }
    return best;
  }
  // A control whose HOST sits outside the visual viewport is a phantom (2026-08-16: an off-canvas detail
  // panel at x=431 on a 430px viewport supplied a whole census of "failures" nobody could touch).
  function inVisualViewport(rect) {
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }
  for (var m2 = 0; m2 < interactiveEls.length; m2 += 1) {
    var iel = interactiveEls[m2];
    if (!isVisible(iel) || isDevChrome(iel)) continue;
    // Base UI mints 1-2px native-input TWINS (aria-hidden and/or tabindex=-1) behind
    // Select/Slider/Switch — hidden plumbing, not offered targets, and the measured #1 FP class
    // (a full pass once produced 52 tap-target/aria-name findings, all this shape).
    if (iel.closest("[aria-hidden='true']")) continue;
    var irect = iel.getBoundingClientRect();
    if (Math.min(irect.width, irect.height) <= 2) continue;
    if (inVisualViewport(irect)) {
      var half = effectiveHalfExtent(iel, irect);
      // Report the EFFECTIVE extent as the measured size; the box only ever raises it, never lowers it.
      var effective = Math.max(Math.min(irect.width, irect.height), half * 2);
      tapTargets.push({
        selector: describe(iel),
        width: Math.max(irect.width, effective),
        height: Math.max(irect.height, effective),
      });
    }
    accessibleNames.push({
      selector: describe(iel),
      tag: iel.tagName.toLowerCase(),
      hasVisibleText: (iel.textContent || "").trim().length > 0,
      ariaLabel: iel.getAttribute("aria-label"),
      ariaLabelledbyText: labelledbyText(iel),
      title: iel.getAttribute("title"),
      altText: altTextOf(iel),
    });
  }

  var mainLandmarkPresent = document.querySelector("main, [role='main']") !== null;

  // Which target-size floor applies is pointer-conditional (see design-audit-checks.ts checkTapTarget):
  // sample the REAL pointer type this render is under so the tap-target check judges it against the
  // right WCAG floor instead of holding a fine-pointer desktop scale to the 44px touch number.
  var pointerCoarse = window.matchMedia("(pointer: coarse)").matches;

  // ── tabindex smell ────────────────────────────────────────────────────────
  var tabIndexes = [];
  var tabIndexEls = document.querySelectorAll("[tabindex]");
  for (var t = 0; t < tabIndexEls.length; t += 1) {
    var tel = tabIndexEls[t];
    if (isDevChrome(tel)) continue;
    var raw = tel.getAttribute("tabindex");
    var val = Number(raw);
    if (!Number.isNaN(val)) tabIndexes.push({ selector: describe(tel), tabIndex: val });
  }

  // ── z-index escalation (positioned elements only — z-index is inert on static) ──
  var zIndexes = [];
  for (var z = 0; z < allEls.length; z += 1) {
    var zel = allEls[z];
    var zstyle = getComputedStyle(zel);
    if (zstyle.position === "static") continue;
    var zval = Number(zstyle.zIndex);
    if (!Number.isNaN(zval) && zval > 0) zIndexes.push({ selector: describe(zel), zIndex: zval });
  }

  // ── nested cards (card-like = (shadow||border) && (radius||bg)) ─────────
  function isCardLike(el) {
    var s = getComputedStyle(el);
    var hasShadow = s.boxShadow !== "none" && s.boxShadow.trim() !== "";
    var hasBorder =
      Number.parseFloat(s.borderTopWidth) > 0 ||
      Number.parseFloat(s.borderRightWidth) > 0 ||
      Number.parseFloat(s.borderBottomWidth) > 0 ||
      Number.parseFloat(s.borderLeftWidth) > 0 ||
      CARD_CLASS_RE.test(el.className || "");
    var radius = Number.parseFloat(s.borderTopLeftRadius) || 0;
    var bg = parseRgb(s.backgroundColor);
    var hasBg = bg !== null && bg.a > 0.05;
    return (hasShadow || hasBorder) && (radius > 0 || hasBg);
  }
  // AN INTERACTIVE ISLAND IS NOT A NESTED CARD (2026-08-16 — 26/26 findings on home were this shape).
  // Chrome-diet CD1 SANCTIONS border+radius+bg on interactive islands and elevated surfaces
  // (.claude/skills/side-eye-design-review/reference/design-context.md:38; the density spec's own words:
  // "a grid cell IS an interactive island", docs/design/density-pass-spec.md:134). So a button/link/
  // input/[role=button] carrying a border and a radius inside a card is the house style, not a defect.
  // The rule keeps its real target: a decorative CARD PANEL nested inside another card panel.
  var INTERACTIVE_ISLAND_SELECTOR = "a,button,input,select,textarea,summary,[role=button],[role=link],[role=menuitem],[role=option],[role=tab],[role=switch],[role=checkbox],[role=radio]";
  function isInteractiveIsland(el) {
    if (el.matches(INTERACTIVE_ISLAND_SELECTOR)) return true;
    // A wrapper whose whole job is to host one control (the label+control field shell) rides along.
    return el.closest(INTERACTIVE_ISLAND_SELECTOR) !== null;
  }
  function isExcludedCardContext(el) {
    var s = getComputedStyle(el);
    if (s.position === "absolute" || s.position === "fixed") return true;
    if (isInteractiveIsland(el)) return true;
    // A PILL is a chip, not a panel. Fully-rounded geometry (radius >= half the short side) is the
    // badge/avatar/tag shape — the rule's real target is a bordered PANEL nested in a bordered panel,
    // and a "Dormant" status pill inside a card is house vocabulary, not a card-in-card.
    var pillRect = el.getBoundingClientRect();
    var pillRadius = Number.parseFloat(s.borderTopLeftRadius) || 0;
    if (pillRadius >= Math.min(pillRect.width, pillRect.height) / 2) return true;
    var role = el.getAttribute("role") || "";
    if (EXCLUDE_CARD_CONTEXT_RE.test(el.className || "") || EXCLUDE_CARD_CONTEXT_RE.test(role)) return true;
    var text = (el.textContent || "").trim();
    var rect = el.getBoundingClientRect();
    if (text.length < 10 && rect.width < 50 && rect.height < 30) return true;
    return false;
  }
  var cardEls = [];
  for (var c = 0; c < allEls.length; c += 1) {
    var cel = allEls[c];
    if (!isVisible(cel) || !isCardLike(cel) || isExcludedCardContext(cel)) continue;
    cardEls.push(cel);
  }
  var nestedSet = [];
  for (var n = 0; n < cardEls.length; n += 1) {
    var cand2 = cardEls[n];
    var p = cand2.parentElement;
    while (p) {
      if (cardEls.indexOf(p) !== -1) {
        nestedSet.push(cand2);
        break;
      }
      p = p.parentElement;
    }
  }
  var innermost = nestedSet.filter(function (el1) {
    return !nestedSet.some(function (el2) {
      return el2 !== el1 && el1.contains(el2);
    });
  });
  var nestedCards = innermost.map(function (el) {
    return { selector: describe(el), isNested: true };
  });

  // ── gradient text (background-clip:text + transparent color) ────────────
  var gradientTexts = [];
  for (var g = 0; g < textEls.length; g += 1) {
    var gel = textEls[g];
    var gs = getComputedStyle(gel);
    var clip = gs.webkitBackgroundClip || gs.backgroundClip;
    var gbg = gs.backgroundImage;
    var gcolorParsed = parseRgb(gs.color);
    var isTransparentColor = gs.color === "transparent" || (gcolorParsed !== null && gcolorParsed.a === 0);
    if (clip === "text" && gbg && gbg.indexOf("gradient") !== -1 && isTransparentColor) {
      gradientTexts.push({ selector: describe(gel), hasGradientText: true });
    }
  }

  // ── animated <img> on hover (statically detectable) ──────────────────────
  var animatedImgHovers = [];
  for (var h = 0; h < imgEls.length; h += 1) {
    var himg = imgEls[h];
    var hcls = typeof himg.className === "string" ? himg.className.split(/\\s+/) : [];
    if (hcls.some(function (c) { return TAILWIND_HOVER_TRANSFORM_RE.test(c); })) {
      animatedImgHovers.push({ selector: describe(himg), hasHoverAnimation: true });
    }
  }
  try {
    for (var s2 = 0; s2 < document.styleSheets.length; s2 += 1) {
      var rules;
      try {
        rules = document.styleSheets[s2].cssRules;
      } catch (e) {
        continue;
      }
      for (var r = 0; r < rules.length; r += 1) {
        var rule = rules[r];
        if (!rule.selectorText) continue;
        if (
          /:hover/i.test(rule.selectorText) &&
          /img/i.test(rule.selectorText) &&
          HOVER_TRANSFORM_RE.test(rule.cssText)
        ) {
          animatedImgHovers.push({ selector: rule.selectorText, hasHoverAnimation: true });
        }
      }
    }
  } catch (e) {
    /* cross-origin stylesheet — skip */
  }

  // ── accent borders (impeccable side-tab / border-accent-on-rounded) ─────
  var accentBorders = [];
  for (var ab = 0; ab < allEls.length && accentBorders.length < 200; ab += 1) {
    var abel = allEls[ab];
    if (!isVisible(abel)) continue;
    var abTag = abel.tagName.toLowerCase();
    var abStyle = getComputedStyle(abel);
    var widths = {
      top: Number.parseFloat(abStyle.borderTopWidth) || 0,
      right: Number.parseFloat(abStyle.borderRightWidth) || 0,
      bottom: Number.parseFloat(abStyle.borderBottomWidth) || 0,
      left: Number.parseFloat(abStyle.borderLeftWidth) || 0,
    };
    var maxW = Math.max(widths.top, widths.right, widths.bottom, widths.left);
    if (maxW < 2) continue;
    var ownBg = parseRgb(abStyle.backgroundColor);
    if (BORDER_SAFE_TAGS[abTag] === 1) continue;
    if (abTag === "span" && !(ownBg && ownBg.a > 0.5)) continue;
    accentBorders.push({
      selector: describe(abel),
      tag: abTag,
      widths: widths,
      colors: {
        top: parseRgb(abStyle.borderTopColor),
        right: parseRgb(abStyle.borderRightColor),
        bottom: parseRgb(abStyle.borderBottomColor),
        left: parseRgb(abStyle.borderLeftColor),
      },
      radius: Number.parseFloat(abStyle.borderTopLeftRadius) || 0,
      badgeLike: abTag === "span" && !!(ownBg && ownBg.a > 0.5),
      tabContext: !!(abel.closest("[role='tablist'],[role='tab'],nav") || abel.getAttribute("aria-selected") !== null),
      statusContext: !!abel.closest("[role='status'],[role='alert'],[aria-live]"),
    });
  }

  // ── chromatic glow shadows (impeccable dark-glow) ────────────────────────
  var shadowGlows = [];
  for (var sg = 0; sg < allEls.length && shadowGlows.length < 200; sg += 1) {
    var sgel = allEls[sg];
    var sgStyle = getComputedStyle(sgel);
    var bs = sgStyle.boxShadow;
    var ts = sgStyle.textShadow;
    if ((bs === "none" || !bs) && (ts === "none" || !ts)) continue;
    if (!isVisible(sgel)) continue;
    var sgBackdrop = resolveBackdrop(sgel.parentElement || sgel);
    shadowGlows.push({
      selector: describe(sgel),
      boxShadow: bs === "none" ? "" : bs,
      textShadow: ts === "none" ? "" : ts,
      backdropColor: sgBackdrop.kind === "flat" ? sgBackdrop.color : null,
    });
  }

  // ── radial-gradient washes incl. pseudo-elements (impeccable radial-halo /
  //    radial-spotlight-glow; sanctioned owner carriers tagged, judged in checks) ──
  var radialGlows = [];
  var PSEUDOS = ["", "::before", "::after"];
  for (var rg = 0; rg < allEls.length && radialGlows.length < 100; rg += 1) {
    var rgel = allEls[rg];
    if (!isVisible(rgel)) continue;
    for (var pi = 0; pi < PSEUDOS.length; pi += 1) {
      var pStyle = PSEUDOS[pi] === "" ? getComputedStyle(rgel) : getComputedStyle(rgel, PSEUDOS[pi]);
      if (PSEUDOS[pi] !== "" && (!pStyle.content || pStyle.content === "none")) continue;
      var rbg = pStyle.backgroundImage || "";
      if (rbg.indexOf("radial-gradient") === -1) continue;
      var rrect = rgel.getBoundingClientRect();
      radialGlows.push({
        selector: describe(rgel) + PSEUDOS[pi],
        value: rbg,
        width: rrect.width,
        height: rrect.height,
        sanctioned: !!(rgel.matches && rgel.matches(SANCTIONED_GLOW_SEL)),
      });
    }
  }

  // ── decorative bg patterns: stripes + grid-line fields (impeccable
  //    repeating-stripes-gradient / codex-grid-background) ──────────────────
  var bgPatterns = [];
  for (var bp = 0; bp < allEls.length && bgPatterns.length < 50; bp += 1) {
    var bpel = allEls[bp];
    if (!isVisible(bpel)) continue;
    var bpStyle = getComputedStyle(bpel);
    var bpImg = bpStyle.backgroundImage || "";
    if (bpImg === "none") continue;
    var isStripe = bpImg.indexOf("repeating-linear-gradient") !== -1;
    var linearCount = (bpImg.match(/(?:^|[^-])linear-gradient\\(/g) || []).length;
    var sizeMatch = /^\\s*([\\d.]+)px\\s+([\\d.]+)px/.exec(bpStyle.backgroundSize || "");
    var isGrid = !isStripe && linearCount >= 2 && !!sizeMatch && Number(sizeMatch[1]) <= 200 && Number(sizeMatch[2]) <= 200;
    if (!isStripe && !isGrid) continue;
    var bpRect = bpel.getBoundingClientRect();
    bgPatterns.push({
      selector: describe(bpel),
      kind: isStripe ? "stripe" : "grid",
      backgroundSize: bpStyle.backgroundSize || "",
      width: bpRect.width,
      height: bpRect.height,
    });
  }

  // ── icon tile stacked above a heading (impeccable icon-tile-stack) ───────
  var iconTiles = [];
  var headingEls = document.querySelectorAll("h1,h2,h3,h4,h5,h6");
  for (var ht = 0; ht < headingEls.length; ht += 1) {
    var hel = headingEls[ht];
    if (!isVisible(hel) || isDevChrome(hel)) continue;
    var sibEl = hel.previousElementSibling;
    if (!sibEl || HEADING_TAGS[sibEl.tagName.toLowerCase()] === 1 || !isVisible(sibEl)) continue;
    var sibStyle = getComputedStyle(sibEl);
    var sibRect = sibEl.getBoundingClientRect();
    var sibBg = parseRgb(sibStyle.backgroundColor);
    var iconChild = sibEl.querySelector("svg,i[class*='icon'],span[class*='icon']");
    iconTiles.push({
      headingTag: hel.tagName.toLowerCase(),
      headingText: (hel.textContent || "").trim().slice(0, 60),
      headingTop: hel.getBoundingClientRect().top,
      siblingSelector: describe(sibEl),
      siblingWidth: sibRect.width,
      siblingHeight: sibRect.height,
      siblingBottom: sibRect.bottom,
      siblingBgAlpha: sibBg ? sibBg.a : 0,
      siblingHasBgImage: !!(sibStyle.backgroundImage && sibStyle.backgroundImage !== "none"),
      siblingBorderWidth: Number.parseFloat(sibStyle.borderTopWidth) || 0,
      siblingRadiusPx: Number.parseFloat(sibStyle.borderTopLeftRadius) || 0,
      hasIconChild: !!iconChild,
      iconChildWidth: iconChild ? iconChild.getBoundingClientRect().width : 0,
    });
  }

  // ── static motion offenders (impeccable bounce-easing / layout-transition).
  //    Overshoot-bezier extraction is a bounded numeric FACT filter (the
  //    nestedCards precedent); rule/severity/exemption verdicts stay in checks. ──
  var motionStatics = [];
  var LAYOUT_PROP_RE = /^(width|height|max-width|max-height|min-width|min-height|padding(-(top|right|bottom|left))?|margin(-(top|right|bottom|left))?)$/;
  var BOUNCE_NAME_RE = /bounce|elastic|wobble|jiggle|spring/i;
  var BEZIER_RE = /cubic-bezier\\(\\s*([\\d.-]+)\\s*,\\s*([\\d.-]+)\\s*,\\s*([\\d.-]+)\\s*,\\s*([\\d.-]+)\\s*\\)/g;
  for (var ms = 0; ms < allEls.length && motionStatics.length < 100; ms += 1) {
    var msel = allEls[ms];
    if (!isVisible(msel)) continue;
    var msStyle = getComputedStyle(msel);
    var an = msStyle.animationName || "none";
    if (an !== "none" && BOUNCE_NAME_RE.test(an)) {
      motionStatics.push({ selector: describe(msel), kind: "bounce-name", value: an, panelExempt: false });
      continue;
    }
    var tfAll = (msStyle.transitionTimingFunction || "") + " " + (msStyle.animationTimingFunction || "");
    if (tfAll.indexOf("cubic-bezier") !== -1) {
      var bm;
      BEZIER_RE.lastIndex = 0;
      while ((bm = BEZIER_RE.exec(tfAll)) !== null) {
        var y1 = Number.parseFloat(bm[2]);
        var y2 = Number.parseFloat(bm[4]);
        if (y1 < -0.1 || y1 > 1.1 || y2 < -0.1 || y2 > 1.1) {
          motionStatics.push({ selector: describe(msel), kind: "overshoot-bezier", value: bm[0], panelExempt: false });
          break;
        }
      }
    }
    var tp = msStyle.transitionProperty || "";
    if (tp !== "all" && tp !== "none" && tp !== "") {
      var durs = (msStyle.transitionDuration || "").split(",");
      var props = tp.split(",");
      var layoutHits = [];
      for (var tpi = 0; tpi < props.length; tpi += 1) {
        var prop = props[tpi].trim().toLowerCase();
        if (!LAYOUT_PROP_RE.test(prop)) continue;
        var dur = Number.parseFloat((durs[tpi] || durs[0] || "0").trim()) || 0;
        if (dur > 0) layoutHits.push(prop);
      }
      if (layoutHits.length > 0) {
        motionStatics.push({
          selector: describe(msel),
          kind: "layout-transition",
          value: layoutHits.join(", "),
          panelExempt: !!msel.closest(PANEL_EXEMPT_SEL),
        });
      }
    }
  }

  // ── heading order (impeccable skipped-heading; visible headings only so a
  //    hidden warm pane's outline can't fake a skip) ────────────────────────
  var headings = [];
  for (var ho = 0; ho < headingEls.length; ho += 1) {
    var hoel = headingEls[ho];
    if (!isVisible(hoel) || hoel.closest("[aria-hidden='true']") || isDevChrome(hoel)) continue;
    headings.push({ level: Number(hoel.tagName[1]), text: (hoel.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60) });
  }

  // ── text overflow (impeccable text-overflow — block + inline arms) ───────
  var overflows = [];
  var OVERFLOW_SKIP_TAGS = { pre: 1, code: 1, textarea: 1, svg: 1, canvas: 1, select: 1, option: 1 };
  var isScrollRegion = function (s) {
    return /(auto|scroll)/.test(s.overflowX || "") || /(auto|scroll)/.test(s.overflow || "") || /(auto|scroll)/.test(s.overflowY || "");
  };
  for (var ov = 0; ov < allEls.length && overflows.length < 100; ov += 1) {
    var ovel = allEls[ov];
    var ovTag = ovel.tagName.toLowerCase();
    if (OVERFLOW_SKIP_TAGS[ovTag] === 1) continue;
    if (ovel.namespaceURI === "http://www.w3.org/2000/svg") continue;
    if (!isVisible(ovel) || ovel.closest("[aria-hidden='true']")) continue;
    var hasDirect = false;
    for (var oc = 0; oc < ovel.childNodes.length; oc += 1) {
      var on = ovel.childNodes[oc];
      if (on.nodeType === 3 && on.textContent.trim().length > 0) { hasDirect = true; break; }
    }
    if (!hasDirect) continue;
    var ovStyle = getComputedStyle(ovel);
    var ovRect = ovel.getBoundingClientRect();
    if (ovRect.width <= 2 && ovRect.height <= 2) continue; // sr-only shapes
    if (isScrollRegion(ovStyle)) continue;
    var scrollAnc = false;
    for (var oap = ovel.parentElement; oap; oap = oap.parentElement) {
      if (isScrollRegion(getComputedStyle(oap))) { scrollAnc = true; break; }
    }
    if (scrollAnc) continue;
    var delta = ovel.scrollWidth - ovel.clientWidth;
    if (ovel.clientWidth > 0 && delta >= 16) {
      overflows.push({ selector: describe(ovel), spillPx: Math.round(delta), mode: "block" });
      continue;
    }
    if (ovel.clientWidth === 0 && ovRect.width > 0) {
      var container = ovel.parentElement;
      while (container && container.clientWidth === 0) container = container.parentElement;
      if (!container) continue;
      var transformed = false;
      for (var tpp = ovel; tpp && tpp !== container.parentElement; tpp = tpp.parentElement) {
        var tv = getComputedStyle(tpp).transform;
        if (tv && tv !== "none") { transformed = true; break; }
      }
      if (transformed) continue;
      var cRect = container.getBoundingClientRect();
      var spill = ovRect.right - (cRect.left + container.clientLeft + container.clientWidth);
      if (spill >= 16) {
        overflows.push({ selector: describe(ovel), spillPx: Math.round(spill), mode: "inline" });
      }
    }
  }

  // ── repeated literal text inside one decorated container (impeccable
  //    repeated-container-text; structural-signature grouping in-page) ──────
  var repeatedTexts = [];
  var REPEAT_SKIP_SEL = "table,select,datalist,nav,menu,[role='navigation'],[role='menu'],[role='menubar'],[role='listbox'],[role='grid'],[role='tablist'],[role='radiogroup'],[aria-hidden='true']";
  var REPEAT_CONTAINER_TAGS = { div: 1, section: 1, article: 1, aside: 1, main: 1, figure: 1, form: 1, fieldset: 1, details: 1, li: 1 };
  var repeatContainers = [];
  var repeatContainerSet = new Set();
  for (var rc = 0; rc < allEls.length; rc += 1) {
    var rcel = allEls[rc];
    if (REPEAT_CONTAINER_TAGS[rcel.tagName.toLowerCase()] !== 1) continue;
    if (rcel.closest(REPEAT_SKIP_SEL)) continue;
    var rcStyle = getComputedStyle(rcel);
    var rcShadow = rcStyle.boxShadow !== "none" && rcStyle.boxShadow.trim() !== "";
    var rcBorderSides = 0;
    if ((Number.parseFloat(rcStyle.borderTopWidth) || 0) >= 1) rcBorderSides += 1;
    if ((Number.parseFloat(rcStyle.borderRightWidth) || 0) >= 1) rcBorderSides += 1;
    if ((Number.parseFloat(rcStyle.borderBottomWidth) || 0) >= 1) rcBorderSides += 1;
    if ((Number.parseFloat(rcStyle.borderLeftWidth) || 0) >= 1) rcBorderSides += 1;
    var rcRadius = (Number.parseFloat(rcStyle.borderRadius) || 0) > 0;
    var rcBg = parseRgb(rcStyle.backgroundColor);
    var rcHasBg = !!(rcBg && rcBg.a > 0.1);
    if (!((rcShadow || rcBorderSides >= 3) && (rcRadius || rcHasBg))) continue;
    repeatContainers.push(rcel);
    repeatContainerSet.add(rcel);
  }
  for (var rci = 0; rci < repeatContainers.length && repeatedTexts.length < 40; rci += 1) {
    var rcont = repeatContainers[rci];
    if (!isVisible(rcont)) continue;
    var rdesc = rcont.querySelectorAll("*");
    if (rdesc.length > 250) continue;
    var groups = {};
    for (var rd = 0; rd < rdesc.length; rd += 1) {
      var del = rdesc[rd];
      var owned = false;
      for (var ranc = del.parentElement; ranc && ranc !== rcont; ranc = ranc.parentElement) {
        if (repeatContainerSet.has(ranc)) { owned = true; break; }
      }
      if (owned) continue;
      if (del.closest(REPEAT_SKIP_SEL)) continue;
      if (/icon|material-symbols|(?:^|\\s)fa[srlbd]?(?:\\s|-|$)/i.test(String(del.getAttribute("class") || ""))) continue;
      if (!isVisible(del)) continue;
      var dtext = directTextOf(del);
      if (dtext.length < 4 || dtext.length > 48) continue;
      if (!/[a-zA-Z]/.test(dtext)) continue;
      var sig = [];
      for (var scur = del; scur && scur !== rcont; scur = scur.parentElement) {
        var scls = String(scur.getAttribute("class") || "").trim().split(/\\s+/).filter(Boolean).sort().join(".");
        sig.push(scur.tagName.toLowerCase() + (scls ? "." + scls : ""));
      }
      if (!groups[dtext]) groups[dtext] = [];
      groups[dtext].push(sig.join(">"));
    }
    for (var gt in groups) {
      var sigs = groups[gt];
      if (sigs.length < 3) continue;
      var distinct = new Set(sigs).size;
      if (distinct < 3) continue;
      repeatedTexts.push({ containerSelector: describe(rcont), text: gt.slice(0, 40), count: sigs.length, distinctSigs: distinct });
    }
  }

  // ── clipping container vs positioned child (impeccable clipped-overflow-container) ──
  var clippedOverflows = [];
  var clipsVal = function (v) { return v === "hidden" || v === "clip"; };
  var DECOR_IDENT_RE = /\\b(art|bg|background|badge|blob|crop|decor|dot|glow|grain|image|mask|ornament|overlay|photo|scrim|shadow|shine|texture)\\b/i;
  var VIEWPORT_IDENT_RE = /\\b(carousel|comparison|compare|fisheye|marquee|preview|scroller|slider|slideshow|split|viewport|demo-area|demo-stage|demo-viewport)\\b/i;
  var CHILD_SUBSTANTIVE_SEL = "a[href],button,input,select,summary,textarea,[tabindex]:not([tabindex='-1']),[role='button'],[role='dialog'],[role='link'],[role='listbox'],[role='menu'],[role='menuitem'],[role='option'],[role='tooltip']";
  for (var co = 0; co < allEls.length && clippedOverflows.length < 40; co += 1) {
    var coel = allEls[co];
    var coStyle = getComputedStyle(coel);
    var clipX = clipsVal(coStyle.overflowX) || clipsVal(coStyle.overflow);
    var clipY = clipsVal(coStyle.overflowY) || clipsVal(coStyle.overflow);
    if (!clipX && !clipY) continue;
    if (/(auto|scroll)/.test((coStyle.overflow || "") + (coStyle.overflowX || "") + (coStyle.overflowY || ""))) continue;
    if (!isVisible(coel)) continue;
    var coIdent = ((coel.getAttribute("class") || "") + " " + (coel.getAttribute("id") || "")).toLowerCase();
    var coRoleDesc = (coel.getAttribute("aria-roledescription") || "").toLowerCase();
    if (VIEWPORT_IDENT_RE.test(coIdent) || /\\b(carousel|slider)\\b/.test(coRoleDesc)) continue;
    var coRect = coel.getBoundingClientRect();
    var coChildren = coel.querySelectorAll("*");
    var coTag = coel.tagName.toLowerCase();
    for (var cc = 0; cc < coChildren.length; cc += 1) {
      var cchild = coChildren[cc];
      if (isDevChrome(cchild)) continue;
      var ccStyle = getComputedStyle(cchild);
      var ccPos = ccStyle.position || "";
      if (ccPos !== "absolute" && ccPos !== "fixed") continue;
      // A fixed child of the ROOT clip (html/body overflow gutters) is viewport-anchored — root
      // overflow does not clip it unless the root establishes a containing block. Toasts/portals
      // live exactly there; only a NON-root clipping ancestor is a real cut risk.
      if (ccPos === "fixed" && (coTag === "html" || coTag === "body")) continue;
      // A SCROLL REGION between the child and this clip container means the child is
      // scroll-managed content (virtualizer overscan rows, long panes), not cut UI — geometry
      // "escapes" the outer rect only because the content scrolls.
      var scrollBetween = false;
      for (var sb = cchild.parentElement; sb && sb !== coel; sb = sb.parentElement) {
        if (isScrollRegion(getComputedStyle(sb))) { scrollBetween = true; break; }
      }
      if (scrollBetween) continue;
      // decorative child?
      if (cchild.closest("[aria-hidden='true']")) continue;
      var ccRole = (cchild.getAttribute("role") || "").toLowerCase();
      if (ccRole === "none" || ccRole === "presentation") continue;
      var ccTag = cchild.tagName.toLowerCase();
      if (ccTag === "img" || ccTag === "svg" || ccTag === "canvas" || ccTag === "video") continue;
      var ccIdent = (cchild.getAttribute("class") || "") + " " + (cchild.getAttribute("id") || "");
      var ccText = (cchild.textContent || "").replace(/\\s+/g, " ").trim();
      var ccSubstantive = ccText.length > 0 || (cchild.matches && cchild.matches(CHILD_SUBSTANTIVE_SEL)) || !!cchild.querySelector(CHILD_SUBSTANTIVE_SEL);
      if (DECOR_IDENT_RE.test(ccIdent) && !ccSubstantive) continue;
      if (!ccSubstantive) continue;
      var ccRect = cchild.getBoundingClientRect();
      var escapes = null;
      if (ccRect.width > 0 || ccRect.height > 0) {
        escapes =
          (clipX && (ccRect.left < coRect.left - 2 || ccRect.right > coRect.right + 2)) ||
          (clipY && (ccRect.top < coRect.top - 2 || ccRect.bottom > coRect.bottom + 2));
      }
      if (escapes === false) continue;
      if (escapes === null) {
        var insets = [ccStyle.top, ccStyle.right, ccStyle.bottom, ccStyle.left].join(" ").toLowerCase();
        if (!(/(^|[\\s(])-+(?:\\d|\\.)/.test(insets) || /(^|[\\s(])100(?:\\.0+)?%/.test(insets))) continue;
      }
      clippedOverflows.push({ selector: describe(coel), childSelector: describe(cchild) });
      break;
    }
  }

  // ── cards flush against a scroller edge at rest (impeccable edge-flush-cards) ──
  var edgeFlushCards = [];
  for (var ef = 0; ef < allEls.length && edgeFlushCards.length < 20; ef += 1) {
    var scroller = allEls[ef];
    var efStyle = getComputedStyle(scroller);
    if (!(/(auto|scroll)/.test(efStyle.overflowX || "") || /(auto|scroll)/.test(efStyle.overflow || ""))) continue;
    if (scroller.scrollWidth <= scroller.clientWidth + 8) continue;
    if (scroller.scrollLeft > 4) continue;
    var scRect = scroller.getBoundingClientRect();
    if (scRect.width < 120 || scRect.height < 60) continue;
    var contentLeft = scRect.left + scroller.clientLeft;
    var contentRight = contentLeft + scroller.clientWidth;
    var flushCount = 0;
    var worst = null;
    var cards = scroller.querySelectorAll("*");
    for (var cf = 0; cf < cards.length; cf += 1) {
      var card = cards[cf];
      if (!isVisible(card)) continue;
      var owner = card.parentElement;
      while (owner && owner !== scroller && !(/(auto|scroll)/.test(getComputedStyle(owner).overflowX || ""))) owner = owner.parentElement;
      if (owner !== scroller) continue;
      var cfStyle = getComputedStyle(card);
      var cfRect = card.getBoundingClientRect();
      if (cfRect.width < 80 || cfRect.height < 40) continue;
      var cfBg = parseRgb(cfStyle.backgroundColor);
      var cfHasBg = !!(cfBg && cfBg.a > 0.5);
      var cfBorders = 0;
      if ((Number.parseFloat(cfStyle.borderTopWidth) || 0) > 0) cfBorders += 1;
      if ((Number.parseFloat(cfStyle.borderRightWidth) || 0) > 0) cfBorders += 1;
      if ((Number.parseFloat(cfStyle.borderBottomWidth) || 0) > 0) cfBorders += 1;
      if ((Number.parseFloat(cfStyle.borderLeftWidth) || 0) > 0) cfBorders += 1;
      if (!cfHasBg && cfBorders < 2) continue;
      var leftGutter = cfRect.left - contentLeft;
      var rightGap = contentRight - cfRect.right;
      var flushRight = leftGutter >= 6 && rightGap < 8 && rightGap > -24;
      var flushLeft = rightGap >= 6 && leftGutter < 8 && leftGutter > -24;
      if (!flushRight && !flushLeft) continue;
      flushCount += 1;
      var gap = Math.round(flushRight ? rightGap : leftGutter);
      if (worst === null || gap < worst.gapPx) {
        worst = { cardSelector: describe(card), edge: flushRight ? "right" : "left", gapPx: gap };
      }
    }
    if (worst !== null) {
      edgeFlushCards.push({ scrollerSelector: describe(scroller), cardSelector: worst.cardSelector, edge: worst.edge, gapPx: worst.gapPx, count: flushCount });
    }
  }

  return {
    texts: texts,
    images: images,
    tapTargets: tapTargets,
    accessibleNames: accessibleNames,
    mainLandmarkPresent: mainLandmarkPresent,
    tabIndexes: tabIndexes,
    zIndexes: zIndexes,
    nestedCards: nestedCards,
    gradientTexts: gradientTexts,
    animatedImgHovers: animatedImgHovers,
    pointerCoarse: pointerCoarse,
    textStyles: textStyles,
    accentBorders: accentBorders,
    shadowGlows: shadowGlows,
    radialGlows: radialGlows,
    bgPatterns: bgPatterns,
    iconTiles: iconTiles,
    motionStatics: motionStatics,
    fontCensus: { families: Object.keys(fontFamilies), sizes: Object.keys(fontSizes).map(Number) },
    brokenImages: brokenImages,
    headings: headings,
    overflows: overflows,
    repeatedTexts: repeatedTexts,
    clippedOverflows: clippedOverflows,
    edgeFlushCards: edgeFlushCards,
  };
})()`;
