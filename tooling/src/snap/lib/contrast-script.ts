// THE IN-PAGE FACT SCRIPT for `--contrast` — one raw-string IIFE that gathers the RAW facts a
// verdict is formed from (colours as strings, box, size, weight, the paint classifiers) and
// classifies NOTHING. Lifted out of ops/contrast.ts when the fill arm (#1111) pushed that file past
// the 450-line tooling cap; it is a pure string builder, which is what lib/ is for.
//
// RAW STRING (JSON.stringify-interpolated selector), not a function reference. The surviving reason (the
// original was tsx keepNames — tsx was SHED 2026-08-03, node runs the .ts source): the body executes in
// the BROWSER, and tsc checks a function body against tooling's NODE lib, where every DOM name is TS2584.
// This IIFE gathers RAW facts only (colours as strings, size, weight); ALL classification
// (large-text/ratio/pass-fail) happens back in Node, reusing design-audit-checks.ts's WCAG math — the same
// split design-audit.ts's walker uses.
//
// A LITERAL BACKTICK IN THIS STRING ENDS IT — every one inside the script (including inside its own
// comments) is escaped `\``, and an unescaped one turns the rest of the file into code the parser reads as
// nonsense (paid 2026-09-02 while adding the icon-ink classifier).
import { INACTIVE_KIND_EXPR, MEASURABLE_OPACITY_MIN } from "../../_shared/wcag.ts";

export function buildContrastScript(selector: string): string {
  return `(() => {
    // THE FIRST DOM MATCH IS NOT THE ONE THE USER SEES (2026-08-16). In a virtualized transcript the
    // first match is routinely a recycled, off-viewport, mid-fade node — measuring it produced two
    // retracted contrast P0s (it even printed "dimmed α0.50" while emitting FAIL). Walk to the first
    // match that is actually RENDERED IN THE VIEWPORT; if none is, return the off-screen refusal and let
    // Node decline a verdict rather than measure a node nobody can look at.
    var all = document.querySelectorAll(${JSON.stringify(selector)});
    if (all.length === 0) return null;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    function inViewport(node) {
      var s = getComputedStyle(node);
      if (s.display === "none" || s.visibility === "hidden") return false;
      var r = node.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return false;
      return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    }
    // IN THE VIEWPORT IS NOT VISIBLE (2026-08-18, #211). An element whose box is in the viewport but sits
    // BEHIND fixed chrome — text at y=38 under a 48px topbar — passed the rect test, and the sample ring
    // was then drawn over the CHROME's pixels: the reported ratio measured the topbar. Ask the compositor
    // who owns the box's visible centre, the same ownership test design-audit-walker's ownsPoint uses:
    // the hit must BE the candidate, be inside it, or be an ancestor of it (an ancestor answers when the
    // candidate takes no pointer of its own, and it is still what is painted there).
    function describeNode(n) {
      var slot = n.getAttribute("data-slot");
      var label = n.getAttribute("aria-label");
      var cls = typeof n.className === "string" && n.className ? "." + n.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
      return n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + (slot ? "[data-slot=" + slot + "]" : "") + cls + (label ? " (" + label + ")" : "");
    }
    // elementFromPoint is BLIND to a pointer-events:none subtree, so its silence there means "I cannot
    // tell", not "occluded" — a tooltip/overlay label would otherwise be refused a verdict it deserves.
    // Inconclusive keeps the OLD behaviour (measure it); only a KNOWN foreign owner rejects.
    function pointerTransparent(node) {
      var n = node;
      while (n) { if (getComputedStyle(n).pointerEvents === "none") return true; n = n.parentElement; }
      return false;
    }
    function occluderOf(node) {
      if (pointerTransparent(node)) return null;
      var r = node.getBoundingClientRect();
      var x = (Math.max(0, r.left) + Math.min(vw, r.right)) / 2;
      var y = (Math.max(0, r.top) + Math.min(vh, r.bottom)) / 2; // the VISIBLE box's centre — a half-scrolled
      if (x < 0 || y < 0 || x >= vw || y >= vh) return null;     // element must not be judged by an off-screen point
      var hit = document.elementFromPoint(x, y);
      if (hit === null) return null;
      if (hit === node || node.contains(hit) || hit.contains(node)) return null;
      return describeNode(hit);
    }
    var el = null;
    var matchIndex = -1;
    var inViewportCount = 0;
    var firstOccluder = null;
    for (var mi = 0; mi < all.length; mi += 1) {
      if (!inViewport(all[mi])) continue;
      inViewportCount += 1;
      var blocker = occluderOf(all[mi]);
      // An occluded candidate is SKIPPED, not fatal — the next match may be the one on screen.
      if (blocker !== null) { if (firstOccluder === null) firstOccluder = blocker; continue; }
      el = all[mi];
      matchIndex = mi;
      break;
    }
    if (!el && inViewportCount > 0) return { occluded: true, total: all.length, inViewport: inViewportCount, occluder: firstOccluder };
    if (!el) return { offscreen: true, total: all.length };
    // Tailwind v4 tokens are oklch(); Chromium's getComputedStyle SERIALIZES CSS Color 4
    // functions (oklch/oklab/lab/lch/color()) back verbatim rather than converting to rgb() —
    // so style.color can read "oklch(0.7 0.1 200)". Round-tripping through fillStyle does NOT
    // fix this (Chromium 149 preserves oklch() there too, verified empirically) — but actually
    // COMPOSITING to a canvas pixel and reading the byte values back DOES force real sRGB
    // conversion (canvas is an 8-bit raster surface; un-premultiply cancels any source alpha,
    // so this is accurate even for translucent colors). One shared 1x1 probe canvas, reused
    // across every color this script converts.
    var probeCanvas = document.createElement("canvas");
    probeCanvas.width = 1;
    probeCanvas.height = 1;
    var probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
    function toRgbString(cssColor) {
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = cssColor;
      probeCtx.fillRect(0, 0, 1, 1);
      var d = probeCtx.getImageData(0, 0, 1, 1).data;
      return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";
    }
    function isTransparent(c) { return c === "rgba(0, 0, 0, 0)" || c === "transparent"; }
    // TRUE opacity test: composite the color over pure black AND pure white; identical bytes ⇒ alpha 1.
    // (Avoids parsing oklch()/oklab() alpha in-page.)
    function compositeOver(cssColor, baseRgb) {
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = baseRgb;
      probeCtx.fillRect(0, 0, 1, 1);
      probeCtx.fillStyle = cssColor; // source-over IS alpha compositing
      probeCtx.fillRect(0, 0, 1, 1);
      var d = probeCtx.getImageData(0, 0, 1, 1).data;
      return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";
    }
    function isOpaque(cssColor) {
      return compositeOver(cssColor, "rgb(0,0,0)") === compositeOver(cssColor, "rgb(255,255,255)");
    }
    // Walk ancestors collecting every non-transparent background from the element DOWN to the first
    // OPAQUE one (the real base), then composite the translucent layers over it bottom-to-top. A glass
    // panel (color-mix at 0.7 alpha) over a dark base now yields the VISUAL backdrop the eye sees — the
    // old code took a translucent layer's own rgb as if opaque (the 1.11-vs-2.6 false-FAIL side-eye hit).
    //
    // THE FALSE-FLAT BLIND SPOT: this ancestor walk sees only the DOM chain — a FIXED-position sibling
    // layer (the app's ThemeBackgroundLayer photo, or a scrim painting under .shell-grid) is invisible
    // to it. If the chain resolves with NO opaque background found, the old code fabricated a white base
    // and passed text that was actually ~1.8:1 over a bright photo. We now REFUSE that: a walk that
    // never hits an opaque bg returns "transparent" (Node pixel-samples the real composite), and a
    // background-image ancestor returns "indeterminate" (Node pixel-samples too) — never a fake baseline.
    //
    // FIXED SIBLING OVER AN OPAQUE ROOT (blind-spot round 2): ThemeBackgroundLayer paints its photo as a
    // fixed z-base sibling OVER the opaque <body>/<html>. So an "opaque base" found only at the root is
    // NOT what's visually behind the element — the photo occludes it. When the app's bg-image is active
    // (its own [data-has-bg-image] shell signal), a root-level base is untrustworthy → pixel-sample.
    // (GENERIC GAP not covered: any app that paints a fixed sibling over the body without this signal
    // would still fool the root-base trust — a generic "root base + a fixed painted layer exists" →
    // indeterminate rule could catch it, but is left out here as it can't be verified app-agnostically.)
    var bgImageActive = document.querySelector("[data-has-bg-image]") !== null;
    function resolveBackdrop(node) {
      var layers = []; // element-first (topmost) → base-last (bottommost non-transparent)
      var base = null;
      while (node) {
        var s = getComputedStyle(node);
        if (s.backgroundImage && s.backgroundImage !== "none") return { kind: "indeterminate" };
        var bc = s.backgroundColor;
        if (!isTransparent(bc)) {
          if (isOpaque(bc)) {
            if (bgImageActive && (node === document.body || node === document.documentElement)) {
              return { kind: "transparent" };
            }
            base = toRgbString(bc);
            break;
          }
          layers.push(bc);
        }
        node = node.parentElement;
      }
      // No opaque base anywhere in the chain — a fixed/sibling layer may be painting behind, unseen.
      // Don't invent white; tell Node to pixel-sample the actual rendered pixels.
      if (base === null) return { kind: "transparent" };
      // Paint the opaque base, then the translucent layers bottom-up (reverse of the element-first array).
      var acc = base;
      for (var i = layers.length - 1; i >= 0; i--) acc = compositeOver(layers[i], acc);
      return { kind: "flat", color: acc };
    }
    var style = getComputedStyle(el);
    var fw = style.fontWeight;
    var fontWeight = fw === "bold" ? 700 : fw === "normal" ? 400 : Number(fw) || 400;
    // ::placeholder blind spot: an EMPTY input/textarea paints its PLACEHOLDER, not its text color —
    // reading style.color measures the (invisible) text color and reports a false PASS. When the field
    // is empty, measure the pseudo-element's color instead (the pixels the eye actually sees).
    var tag = el.tagName;
    var colorSource = style.color;
    if ((tag === "INPUT" || tag === "TEXTAREA") && !el.value) {
      var phColor = getComputedStyle(el, "::placeholder").color;
      if (phColor && !isTransparent(phColor)) colorSource = phColor;
    }
    // Role/content awareness (Node applies the threshold): a target that renders NO text is a UI
    // COMPONENT (WCAG 1.4.11, 3:1), not a 4.5:1 text target; a control-track role is skipped entirely.
    var role = el.getAttribute("role") || "";
    if (!role) {
      if (tag === "INPUT") {
        var inputType = (el.getAttribute("type") || "text").toLowerCase();
        if (inputType === "range") role = "slider";
        else if (inputType === "checkbox") role = "checkbox";
      } else if (tag === "PROGRESS") role = "progressbar";
    }
    var hasText = (el.textContent || "").replace(/\\s+/g, " ").trim().length > 0;
    // #1111: does this subject paint ink of its OWN? An <svg> draws with currentColor, so style.color is
    // its real paint and the ink arm stays honest for an icon-only control. A no-text subject WITHOUT one
    // paints only its box, and its style.color is an inherited value nothing on screen uses — that is the
    // FILL arm's subject (the switch thumb that read 16.26:1 before and after its fill changed).
    //
    // PRESENT IS NOT PAINTED, and the subject the issue was filed ON is the proof: [data-slot=switch-thumb]
    // ALWAYS renders a Lock <svg>, held at opacity-0 until the switch is readOnly (switch.tsx). A mere
    // querySelector("svg") therefore hands the thumb back to the ink arm and the false clean survives
    // untouched. So an icon only counts when it is actually painted: a real box, not display/visibility
    // hidden, and above the same measurable-opacity floor the exemptions use.
    function paintedIconInk(root) {
      var svgs = root.tagName === "svg" ? [root] : root.querySelectorAll("svg");
      for (var si = 0; si < svgs.length; si += 1) {
        var svg = svgs[si];
        var box = svg.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) continue;
        var st = getComputedStyle(svg);
        if (st.display === "none" || st.visibility === "hidden") continue;
        var alpha = 1;
        for (var n = svg; n && n !== root.parentElement; n = n.parentElement) {
          var raw = getComputedStyle(n).opacity;
          var val = raw === "" ? 1 : Number(raw);
          if (!Number.isNaN(val)) alpha *= val;
        }
        if (alpha >= ${MEASURABLE_OPACITY_MIN}) return true;
      }
      return false;
    }
    var hasIconInk = paintedIconInk(el);
    // ONE classifier, shared with design-audit via _shared/wcag.ts (#624 — two homes for this rule is
    // exactly how the two instruments came to disagree about the SAME element). \`inactiveKind\` carries the
    // spelling (native/aria/inert) so the SKIPPED line can name it; \`inactive\` stays a boolean for the
    // verdict, which exempts all three kinds exactly as it always has.
    var inactiveKind = ${INACTIVE_KIND_EXPR};
    var inactive = inactiveKind !== "none";
    // ANCESTOR opacity dims the FOREGROUND (blind-spot round 2): a message-actions row at opacity-40
    // paints the whole subtree — the icon's glyph included — at 0.4 over its backdrop, but style.color
    // still reads the UN-dimmed rgb (a ~11:1 false PASS where the eye sees ~2.6:1). CSS opacity groups
    // multiply down the chain, so accumulate the product over the element + every ancestor. Node then
    // composites the foreground rgb at this alpha over the resolved backdrop before the ratio (the
    // BACKGROUND half is already handled — css-resolve/pixel-sample sees the true bg; the FOREGROUND
    // dimming is the half only this multiply can fix). Note: a background INSIDE the dimmed group is an
    // unhandled edge (rare) — the common case is a transparent-bg row over an opaque backdrop.
    var foregroundOpacity = 1;
    var opNode = el;
    while (opNode) {
      var opRaw = getComputedStyle(opNode).opacity;
      var opVal = opRaw === "" ? 1 : Number(opRaw);
      if (!Number.isNaN(opVal)) foregroundOpacity *= opVal;
      opNode = opNode.parentElement;
    }
    var rect = el.getBoundingClientRect();
    // CORNER RADII, in px, for the FILL arm (#1111). A background is clipped to the border box's ROUNDED
    // shape, so on a pill or a circle the box's corners show whatever is BEHIND the element — measured
    // live on the switch thumb, those corners are the ember accent track, and counting them as one of the
    // thumb's own painted channels produced a 7.44:1 verdict on a colour the thumb does not paint. The
    // fill arm needs the shape to tell "my paint" from "what shows through my corners".
    function radiusPx(value, basis) {
      var n = Number.parseFloat(value);
      if (Number.isNaN(n)) return 0;
      return value.indexOf("%") === -1 ? n : (n / 100) * basis;
    }
    var radii = {
      tl: radiusPx(style.borderTopLeftRadius, rect.width),
      tr: radiusPx(style.borderTopRightRadius, rect.width),
      br: radiusPx(style.borderBottomRightRadius, rect.width),
      bl: radiusPx(style.borderBottomLeftRadius, rect.width),
    };
    return {
      radii: radii,
      color: toRgbString(colorSource),
      fontSizePx: Number.parseFloat(style.fontSize) || 16,
      fontWeight: fontWeight,
      backdrop: resolveBackdrop(el),
      hasText: hasText,
      hasIconInk: hasIconInk,
      inactive: inactive,
      role: role,
      tag: tag,
      foregroundOpacity: foregroundOpacity,
      box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      matchIndex: matchIndex,
      total: all.length,
    };
  })()`;
}
