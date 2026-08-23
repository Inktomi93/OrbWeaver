// ui-audit in-page walker — segment: color probe (canvas normalization) + gradient stops + backdrop resolution + paint-layer census + occluder + natural-size/direct-text loaders.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

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
  // A PAINT LAYER here is deliberately narrow: positioned (fixed/absolute), visibly painted (a background
  // image or any non-zero background alpha), and CONTENTLESS. The contentless test is what keeps a chrome
  // panel — a topbar, a drawer, a dialog — out of this census: those OCCLUDE text rather than back it, and
  // "the topbar is over this glyph" is a different refusal (snap owns it as OCCLUDED). A fixed layer is
  // viewport-anchored, so it backs EVERY element that resolves through it, in view or not; an absolutely
  // positioned one is document-anchored and only matters where it geometrically intersects.
  var OPAQUE_MIN_ALPHA = 0.999;
  var paintLayerCensus = null;
  function paintLayers() {
    if (paintLayerCensus !== null) return paintLayerCensus;
    paintLayerCensus = [];
    var candidates = document.querySelectorAll("*");
    for (var pl = 0; pl < candidates.length; pl += 1) {
      var lel = candidates[pl];
      var ls = getComputedStyle(lel);
      var fixed = ls.position === "fixed";
      if (!fixed && ls.position !== "absolute") continue;
      if ((lel.textContent || "").trim() !== "") continue;
      var lbg = parseRgb(ls.backgroundColor);
      var painted = (ls.backgroundImage && ls.backgroundImage !== "none") || (lbg !== null && lbg.a > 0);
      if (!painted || !isVisible(lel)) continue;
      paintLayerCensus.push({ el: lel, fixed: fixed, rect: lel.getBoundingClientRect() });
    }
    return paintLayerCensus;
  }
  // Is the opaque background found at baseNode actually what the eye sees behind el, or does a paint
  // layer sit on top of it? Only layers INSIDE the base's subtree count (a layer outside it paints under
  // the base's own background, not over it), and never one that contains el — that one is an ancestor
  // and the walk already accounted for it.
  function paintLayerOver(baseNode, el, elRect) {
    var census = paintLayers();
    for (var pi = 0; pi < census.length; pi += 1) {
      var layer = census[pi];
      if (layer.el === el || layer.el.contains(el)) continue;
      if (!baseNode.contains(layer.el) || layer.el === baseNode) continue;
      if (!layer.fixed) {
        var lr = layer.rect;
        if (!(lr.left < elRect.right && lr.right > elRect.left && lr.top < elRect.bottom && lr.bottom > elRect.top)) continue;
      }
      return layer.el;
    }
    return null;
  }
  function resolveBackdrop(el) {
    var node = el;
    var layers = [];
    var elRect = el.getBoundingClientRect();
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
          var over = paintLayerOver(node, el, elRect);
          // fallback is the number the old code returned. It is NOT a verdict — the contrast family
          // refuses it — but the non-verdict consumers (the dark-glow tell) still need a best-effort
          // backdrop, and returning null there would silently drop findings this change never judged.
          if (over !== null) return { kind: "unresolved", reason: "paint-layer-over-base", fallback: acc };
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
