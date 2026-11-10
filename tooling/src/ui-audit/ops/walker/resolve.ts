// ui-audit in-page walker — segment: color probe (canvas normalization) + gradient stops + backdrop resolution + paint-layer census + occluder + natural-size/direct-text loaders.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into collectSamplesJs, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// floor/browser/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../floor/cli/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_RESOLVE = `
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

  // A GRADIENT'S COLOR SPACE IS NOT ITS FORMAT EITHER (issue #189) — the same blindness as probeColor's,
  // one layer down. The old scanner was a regex over rgb()/hex ONLY, so an oklch-authored gradient (the
  // only spelling a tokens-only tree produces) yielded ZERO stops, resolveBackdrop fell through to
  // image-indeterminate, and every glyph over it minted a false P1 text-over-art against a backdrop whose
  // colors are fully known. Stops now come from the gradient's OWN argument list, and every candidate is
  // normalized through the same memoized canvas probe as every other color on this walker: a token the
  // browser understands is a stop, and a prelude the grammar allows instead ("to right", "45deg",
  // "in oklab", "closest-side at 50% 50%", a bare "40%" color hint) fails both fillStyle sentinels and is
  // skipped. Splitting at DEPTH ZERO is what keeps a nested stop — color-mix(in oklab, a, b) — one token,
  // which no flat regex can do. (No backticks in this file: it is one template literal.)
  var GRADIENT_HEAD_RE = /(?:repeating-)?(?:linear|radial|conic)-gradient\\(/gi;
  // A stop is "<color> <position>?" — peel positions off the tail until a color remains (or nothing does).
  var STOP_POSITION_RE = /\\s+[-+]?[0-9.]+[a-z%]*$/i;

  /** Split a gradient's argument list on the commas that are not inside a nested function call. */
  function splitTopLevelArgs(args) {
    var parts = [];
    var depth = 0;
    var start = 0;
    for (var ci = 0; ci < args.length; ci += 1) {
      var ch = args[ci];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      else if (ch === "," && depth === 0) {
        parts.push(args.slice(start, ci));
        start = ci + 1;
      }
    }
    parts.push(args.slice(start));
    return parts;
  }

  /** The color of one gradient argument, or null when the argument is a direction / shape / bare hint. */
  function gradientStopColor(segment) {
    var token = segment.trim();
    while (token !== "") {
      var probed = parseRgb(token);
      if (probed) return probed;
      var shorter = token.replace(STOP_POSITION_RE, "");
      if (shorter === token) return null;
      token = shorter;
    }
    return null;
  }

  // Stops KEEP alpha: a translucent stop makes worst-stop contrast math a lie, so the Node side refuses
  // (indeterminate) instead of trusting it.
  function parseGradientStops(bgImage) {
    var stops = [];
    var head;
    GRADIENT_HEAD_RE.lastIndex = 0;
    while ((head = GRADIENT_HEAD_RE.exec(bgImage)) !== null) {
      var open = head.index + head[0].length;
      var depth = 1;
      var end = open;
      while (end < bgImage.length && depth > 0) {
        var c = bgImage[end];
        if (c === "(") depth += 1;
        else if (c === ")") depth -= 1;
        end += 1;
      }
      var segments = splitTopLevelArgs(bgImage.slice(open, depth === 0 ? end - 1 : end));
      for (var si = 0; si < segments.length; si += 1) {
        var stop = gradientStopColor(segments[si]);
        if (stop) stops.push({ r: stop.r, g: stop.g, b: stop.b, a: stop.a === undefined ? 1 : stop.a });
      }
      GRADIENT_HEAD_RE.lastIndex = end;
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

  // AN ANCESTOR WALK CANNOT SEE A PAINT LAYER THAT IS NOT AN ANCESTOR (issue #218 — 28 false P1s on one
  // transcript). The app paints its wallpaper as a FIXED, contentless, pointer-events-none sibling
  // ([data-slot=theme-background-layer], plus a scrim over it) that covers the viewport and sits between
  // <body>'s own near-black background and everything the shell renders. Walking a 0.65-alpha reading plate
  // down to that body base composited rgb(160,157,155) and reported 3.16:1 — against a color no pixel on
  // screen has; the real composite over the photo measures 4.94:1. The walker cannot know what a photo
  // paints, so the honest move is to say so and let the Node side sample real pixels (design-audit.ts,
  // resolvePixelBackdrops) — the same posture snap's --contrast takes, and the reason it disagreed by
  // 1.6x with this instrument on the app's most important reading surface.
  //
  // A POSITIONED PAINT LAYER is deliberately narrow: fixed/absolute, visibly painted (a background image or
  // any non-zero background alpha), and CONTENTLESS. The contentless test is what keeps a chrome panel — a
  // topbar, a drawer, a dialog — out of this census: those OCCLUDE text rather than back it, and "the topbar
  // is over this glyph" is a different refusal (snap owns it as OCCLUDED). A fixed layer is viewport-anchored,
  // so it backs EVERY element that resolves through it, in view or not; an absolutely positioned one is
  // document-anchored and only matters where it geometrically intersects.
  //
  // ART IN ANY OTHER POSITION BACKS A SUBJECT ONLY UNDER ITS CENTRE. A caption plate sits over the card's
  // ordinary in-flow picture, so art needs no position and may share a host with text. A mere box overlap
  // would be every icon beside a label, so \`centreOnly\` asks whether the art reaches the subject's centre.
  var OPAQUE_MIN_ALPHA = 0.999;
  var REPLACED_ART_SELECTOR = "img, video, canvas, picture";
  var paintLayerCensus = null;
  function paintLayers() {
    if (paintLayerCensus !== null) return paintLayerCensus;
    paintLayerCensus = [];
    var candidates = document.querySelectorAll("*");
    for (var pl = 0; pl < candidates.length; pl += 1) {
      var lel = candidates[pl];
      var ls = getComputedStyle(lel);
      var fixed = ls.position === "fixed";
      var positioned = fixed || ls.position === "absolute";
      var inlineSvg = lel.localName === "svg";
      var replaced = inlineSvg || lel.matches(REPLACED_ART_SELECTOR);
      var imaged = Boolean(ls.backgroundImage) && ls.backgroundImage !== "none";
      if (!positioned && !replaced && !imaged) continue;
      var holdsText = !replaced && (lel.textContent || "").trim() !== "";
      if (holdsText && !imaged) continue;
      var lbg = parseRgb(ls.backgroundColor);
      // A replaced element paints art with no CSS background, whether it is the layer or sits inside it, and a
      // plate over it composites against the pixels, not the body base.
      var holdsArt = lel.querySelector(REPLACED_ART_SELECTOR) !== null;
      var filled = positioned && ((lbg !== null && lbg.a > 0) || holdsArt);
      if (!(imaged || replaced || filled) || !isVisible(lel)) continue;
      paintLayerCensus.push({
        el: lel,
        fixed: fixed,
        rect: lel.getBoundingClientRect(),
        centreOnly: !positioned || inlineSvg || holdsText,
        art: imaged || replaced || holdsArt,
      });
    }
    return paintLayerCensus;
  }
  // A box scrolled out of its own scroller paints nothing past the scroller's edge, though its rect still
  // reaches there. Only an ancestor at or above the containing block clips; a fixed box escapes them all. A
  // scroller that also holds \`other\` clips both alike, so the clip stops there.
  function shownRect(n, rect, other) {
    var box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    var childPosition = getComputedStyle(n).position;
    for (var p = n.parentElement; p && childPosition !== "fixed" && !p.contains(other); p = p.parentElement) {
      var ps = getComputedStyle(p);
      if (childPosition === "absolute" && ps.position === "static") continue;
      // A scroller clips at its padding box: inside its border and its scrollbar.
      var pr = p.getBoundingClientRect();
      var padLeft = pr.left + p.clientLeft;
      var padTop = pr.top + p.clientTop;
      if (ps.overflowX !== "visible") {
        box.left = Math.max(box.left, padLeft);
        box.right = Math.min(box.right, padLeft + p.clientWidth);
      }
      if (ps.overflowY !== "visible") {
        box.top = Math.max(box.top, padTop);
        box.bottom = Math.min(box.bottom, padTop + p.clientHeight);
      }
      childPosition = ps.position;
    }
    return box;
  }
  // WHICH SIDE OF THE SUBJECT DOES THIS LAYER PAINT ON? A layer the browser paints above the subject covers it and
  // is not between it and its base. Each side is ranked by the box that takes part in their nearest common stacking
  // context. Any doubt answers false, so the layer keeps its veto.
  function isFlexOrGridItem(n) {
    var parent = n.parentElement;
    return parent !== null && /flex|grid/.test(getComputedStyle(parent).display);
  }
  function zIndexApplies(n, s) {
    return s.zIndex !== "auto" && (s.position !== "static" || isFlexOrGridItem(n));
  }
  function createsStackingContext(n) {
    if (n === document.documentElement) return true;
    var s = getComputedStyle(n);
    if (s.position === "fixed" || s.position === "sticky" || zIndexApplies(n, s)) return true;
    if (Number(s.opacity) < 1 || s.isolation === "isolate" || s.mixBlendMode !== "normal") return true;
    if (s.transform !== "none" || s.translate !== "none" || s.rotate !== "none" || s.scale !== "none" || s.perspective !== "none") return true;
    if (s.filter !== "none" || (s.backdropFilter || "none") !== "none" || s.clipPath !== "none" || (s.maskImage || "none") !== "none") return true;
    if ((s.viewTransitionName || "none") !== "none") return true;
    if (/transform|opacity|filter|perspective|z-index|clip-path|mask|translate|rotate|scale/.test(s.willChange)) return true;
    return /paint|layout|strict|content/.test(s.contain) || /size/.test(s.containerType || "");
  }
  // The box that takes part in context ctx for n: its outermost stacking context below ctx, else its nearest
  // positioned box (z-level 0; CSS lists every positioned descendant of ctx in tree order, nested ones included),
  // else null for in-flow paint, which every z >= 0 layer covers.
  function paintParticipant(n, ctx) {
    var context = null;
    var positioned = null;
    for (var p = n; p !== null && p !== ctx; p = p.parentElement) {
      if (createsStackingContext(p)) context = p;
      else if (positioned === null && getComputedStyle(p).position !== "static") positioned = p;
    }
    var box = context || positioned;
    if (box === null) return null;
    var bs = getComputedStyle(box);
    return { el: box, level: zIndexApplies(box, bs) ? Number.parseInt(bs.zIndex, 10) : 0 };
  }
  function paintsAboveSubject(layerEl, subject) {
    var common = layerEl.parentElement;
    while (common !== null && !common.contains(subject)) common = common.parentElement;
    if (common === null) return false;
    var ctx = common;
    while (ctx !== null && !createsStackingContext(ctx)) ctx = ctx.parentElement;
    var layer = paintParticipant(layerEl, ctx);
    var text = paintParticipant(subject, ctx);
    if (layer === null) return false;
    if (text === null) return layer.level >= 0;
    if (layer.el.contains(text.el)) return false;
    if (layer.level !== text.level) return layer.level > text.level;
    // A layer nested in the subject's own positioned box still follows it in the tree-order list.
    return (text.el.compareDocumentPosition(layer.el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }
  // Is the opaque background found at baseNode actually what the eye sees behind el, or does a paint
  // layer sit on top of it? Only layers INSIDE the base's subtree count (a layer outside it paints under
  // the base's own background, not over it), and never one that contains el — that one is an ancestor
  // and the walk already accounted for it, nor one the browser paints above el. \`underQuery\` adds the fence
  // the UNDER/AT questions need (below): a layer inside the subject is above its own fill rather than between
  // it and the surface beneath it.
  function paintLayerOver(baseNode, el, elRect, underQuery) {
    var census = paintLayers();
    for (var pi = 0; pi < census.length; pi += 1) {
      var layer = census[pi];
      if (layer.el === el || layer.el.contains(el)) continue;
      if (underQuery && el.contains(layer.el)) continue;
      if (!baseNode.contains(layer.el) || layer.el === baseNode) continue;
      if (paintsAboveSubject(layer.el, el)) continue;
      var lr = layer.rect;
      var subjectRect = elRect;
      // A subject and a layer in different scrollers meet only where both paint. A fixed layer backs the subject
      // at every scroll position, so its veto stays.
      if (!layer.fixed) {
        lr = shownRect(layer.el, layer.rect, el);
        subjectRect = shownRect(el, elRect, layer.el);
        if (subjectRect.left >= subjectRect.right || subjectRect.top >= subjectRect.bottom) continue;
        if (lr.left >= lr.right || lr.top >= lr.bottom) continue;
      }
      if (layer.centreOnly) {
        var centreX = (subjectRect.left + subjectRect.right) / 2;
        var centreY = (subjectRect.top + subjectRect.bottom) / 2;
        if (el.contains(layer.el) || !(lr.left <= centreX && lr.right >= centreX && lr.top <= centreY && lr.bottom >= centreY)) continue;
      } else if (!layer.fixed && !(lr.left < subjectRect.right && lr.right > subjectRect.left && lr.top < subjectRect.bottom && lr.bottom > subjectRect.top)) {
        continue;
      }
      return layer;
    }
    return null;
  }
  // TWO QUESTIONS, ONE WALK. \`resolveBackdrop(el)\` asks what is behind EL's OWN BOX starting at el, so
  // el's own background is the answer when it has one. \`resolveBackdropUnder(el)\` asks what el's fill is
  // painted ON — the same walk from el's PARENT, still measured against EL's box and EL's subtree.
  function resolveBackdropFrom(startNode, subject, underQuery, textQuery) {
    var node = startNode;
    var layers = [];
    var elRect = subject.getBoundingClientRect();
    var gradientAbove = false;
    while (node) {
      var style = getComputedStyle(node);
      var bgImage = style.backgroundImage;
      if (bgImage && bgImage !== "none") {
        if (bgImage.indexOf("gradient") !== -1 && bgImage.indexOf("url(") === -1) {
          var stops = parseGradientStops(bgImage);
          var seeThrough = stops.some(function (stop) { return stop.a < OPAQUE_MIN_ALPHA; });
          if (stops.length > 0 && !seeThrough) {
            if (!gradientAbove) return { kind: "gradient", stops: stops };
            var under = { r: stops[0].r, g: stops[0].g, b: stops[0].b };
            for (var gi = layers.length - 1; gi >= 0; gi -= 1) under = compositeOver(layers[gi], under);
            return { kind: "unresolved", reason: "gradient-over-base", fallback: under };
          }
          // The walk reads on past a translucent gradient: CSS paints this node's own background-color, and
          // whatever is beneath that, under its image. The stop list cannot say which band sits under the glyphs.
          if (stops.length > 0) gradientAbove = true;
          else return { kind: "image-indeterminate" };
        } else {
          return { kind: "image-indeterminate" };
        }
      }
      var bg = parseRgb(style.backgroundColor);
      if (bg && bg.a > 0) {
        if (bg.a >= OPAQUE_MIN_ALPHA) {
          var acc = { r: bg.r, g: bg.g, b: bg.b };
          for (var li = layers.length - 1; li >= 0; li -= 1) acc = compositeOver(layers[li], acc);
          var over = paintLayerOver(node, subject, elRect, underQuery);
          // fallback is the number the old code returned. It is NOT a verdict — the contrast family
          // refuses it — but the non-verdict consumers (the dark-glow tell) still need a best-effort
          // backdrop, and returning null there would silently drop findings this change never judged.
          // Art under the centre backs only this one subject, so the pixel pass scrolls to it. Only an ART layer
          // that backs every text earns the unseen-art reclassification in ops/pixels.ts; a fill is not art.
          if (over !== null) {
            // Only the text census reads the fill reason; every other caller keeps the label it always printed.
            var overReason = over.centreOnly ? "art-under-subject" : over.art || !textQuery ? "paint-layer-over-base" : "fill-layer-over-base";
            return { kind: "unresolved", reason: overReason, fallback: acc };
          }
          if (gradientAbove) return { kind: "unresolved", reason: "gradient-over-base", fallback: acc };
          return { kind: "flat", color: acc };
        }
        layers.push(bg);
      }
      node = node.parentElement;
    }
    // No opaque base anywhere in the chain. The old code fabricated WHITE here and passed text that may be
    // painted over anything at all; snap refuses this exact case. Report it as unresolved so the pixel
    // sampler decides, and carry the historical white composite as the non-verdict fallback.
    var white = { r: 255, g: 255, b: 255 };
    for (var wi = layers.length - 1; wi >= 0; wi -= 1) white = compositeOver(layers[wi], white);
    return { kind: "unresolved", reason: "no-opaque-base", fallback: white };
  }

  function resolveBackdrop(el) {
    return resolveBackdropFrom(el, el, false, false);
  }

  // What is behind a GLYPH, for the reading-surface colour rules: only they name a fill-only layer apart, because
  // ops/pixels.ts reads that reason to keep a fill from being reclassified as art.
  function resolveTextBackdrop(el) {
    return resolveBackdropFrom(el, el, false, true);
  }

  // THE PAINT UNDER A SUBJECT'S OWN BOX (#1155) — for a rule that ranks an element's own FILL and must
  // therefore not count that fill as its own backdrop. Handing \`resolveBackdrop\` the PARENT is the
  // obvious spelling and it is wrong twice over, because every veto is then computed against the PARENT's
  // box and the PARENT's subtree: a layer INSIDE the subject counts (it is painted over the subject, not
  // beneath it) and so does a sibling that never touches the subject's box. Measured on the live
  // Settings -> Appearance (2026-09-02): all three quiet-state cohorts returned
  // unresolved(paint-layer-over-base) naming the checked cell's own \`Radio.Indicator\` — a contentless
  // absolutely-positioned painted span, exactly what the layer census above collects — which alone kept
  // every Config design-audit at population-verdict=NO-VERDICT. A layer that genuinely sits between the
  // resolved base and the subject's box still refuses: only the two false vetoes stopped counting.
  function resolveBackdropUnder(el) {
    return resolveBackdropFrom(el.parentElement, el, true, false);
  }

  // THE PAINT CONTEXT AT A CONTAINER — its own fill (or the first opaque ancestor's), read as the surface
  // its contents sit on, so the layers INSIDE it are what it backs rather than vetoes against it. A layer
  // painted over it from OUTSIDE its own subtree still refuses.
  function resolveBackdropAt(el) {
    return resolveBackdropFrom(el, el, true, false);
  }

  // WHO OWNS THE PIXELS AT THIS BOX (snap's occluderOf, #211 — same test, same vocabulary, because the two
  // instruments must not disagree about what is behind a glyph). An unresolved backdrop is settled by
  // sampling the element's real pixels back in Node, and sampling a box that fixed chrome is painted over
  // measures the CHROME: the first pixel-sampling run of this walker reported 1.33:1 on a paragraph sitting
  // under the 48px topbar, which is the same false-verdict class #211 fixed in snap. Only carried for
  // unresolved samples — an opaque ancestor background is a css fact that occlusion cannot change.
  function describeNode(n) {
    var slot = n.getAttribute ? n.getAttribute("data-slot") : null;
    var cls = typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
    return n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (slot ? "[data-slot=" + slot + "]" : "") + cls;
  }
  // elementFromPoint is BLIND to a pointer-events:none subtree, so its silence there means "I cannot tell",
  // not "occluded" — keep the sample rather than refuse a verdict it deserves.
  function pointerTransparent(n) {
    var p = n;
    while (p) {
      if (getComputedStyle(p).pointerEvents === "none") return true;
      p = p.parentElement;
    }
    return false;
  }
  function occluderOf(el) {
    if (pointerTransparent(el)) return null;
    var r = el.getBoundingClientRect();
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    // The VISIBLE box's centre — a half-scrolled element must not be judged by an off-screen point.
    var x = (Math.max(0, r.left) + Math.min(vw, r.right)) / 2;
    var y = (Math.max(0, r.top) + Math.min(vh, r.bottom)) / 2;
    if (x < 0 || y < 0 || x >= vw || y >= vh) return null;
    var hit = document.elementFromPoint(x, y);
    if (hit === null) return null;
    if (hit === el || el.contains(hit) || hit.contains(el)) return null;
    return describeNode(hit);
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
`;
