// THE IN-PAGE FACT SCRIPT for `--contrast` — one raw-string IIFE that gathers the RAW facts a
// verdict is formed from (colours as strings, box, size, weight, the paint classifiers) and
// classifies NOTHING. Lifted out of ops/contrast.ts when the fill arm (#1111) pushed that file past
// the 450-line tooling cap; it is a pure string builder, which is what lib/ is for.
//
// THE BACKDROP RESOLVER IS NOT SPELLED HERE ANY MORE (#1325). This file used to carry its own DOM-ANCESTOR
// walk, and its own comment named the gap: "GENERIC GAP not covered: any app that paints a fixed sibling
// over the body without this signal would still fool the root-base trust". REPRODUCED 2026-09-04
// (docs/reviews/stickler/2026-09-04-snap-ui-audit-capability-census.md §2.1): white text over a
// `position:fixed; z-index:-1; background:#fff` band read **21.00:1 PASS** through `--contrast`, 1.00:1
// through `--contrast-pixel`, and P1 through design-audit. The walker's resolver answers it GENERICALLY —
// it censuses every fixed/absolute CONTENTLESS painted layer and vetoes a base one of them sits over — so
// this script now composes `WALKER_PRIMITIVES` + `WALKER_RESOLVE` from `ui-audit/index.ts` and asks THAT.
// The app-specific `[data-has-bg-image]` hint is subsumed and gone with it: the census sees the shell's
// art layer without being told about it.
//
// WHAT STAYED SNAP'S, deliberately (the census's MERGE verdict, not a takeover): the per-selector
// addressing, the OFF-SCREEN/OCCLUDED refusal vocabulary, the icon-ink classifier, the control-track
// exemption, the placeholder read, the accumulated foreground opacity, the corner radii for the FILL arm,
// and `--contrast-pixel`. The walker has no per-selector door and no notion of any of those.
//
// THE FOUR-ARM BACKDROP UNION COLLAPSES TO SNAP'S THREE at the seam below, and each mapping is a decision:
// `flat` is a css-resolve verdict; `image-indeterminate` and `gradient` are `indeterminate` (Node pixel-
// samples — the census records the ui-audit/snap divergence on gradients and rules that the ARM keeps
// sampling); `unresolved` (no opaque base, OR a paint layer over the base it found) is `transparent`,
// which is this script's existing "do not invent a baseline, sample the real pixels" arm.
//
// RAW STRING (JSON.stringify-interpolated selector), not a function reference. The surviving reason (the
// original was tsx keepNames — tsx was SHED 2026-08-03, node runs the .ts source): the body executes in
// the BROWSER, and tsc checks a function body against tooling's NODE lib, where every DOM name is TS2584.
// This IIFE gathers RAW facts only (colours as strings, size, weight); ALL classification
// (large-text/ratio/pass-fail) happens back in Node, reusing the same WCAG kernel design-audit uses.
//
// A LITERAL BACKTICK IN THIS STRING ENDS IT — every one inside the script (including inside its own
// comments) is escaped `\``, and an unescaped one turns the rest of the file into code the parser reads as
// nonsense (paid 2026-09-02 while adding the icon-ink classifier).
import { INACTIVE_KIND_EXPR, MEASURABLE_OPACITY_MIN } from "../../_shared/wcag.ts";
import { WALKER_PRIMITIVES, WALKER_RESOLVE } from "../../ui-audit/index.ts";

export function buildContrastScript(selector: string): string {
  return `(() => {
${WALKER_PRIMITIVES}${WALKER_RESOLVE}
    // THE FIRST DOM MATCH IS NOT THE ONE THE USER SEES (2026-08-16). In a virtualized transcript the
    // first match is routinely a recycled, off-viewport, mid-fade node — measuring it produced two
    // retracted contrast P0s (it even printed "dimmed α0.50" while emitting FAIL). Walk to the first
    // match that is actually RENDERED IN THE VIEWPORT; if none is, return the off-screen refusal and let
    // Node decline a verdict rather than measure a node nobody can look at.
    var all = document.querySelectorAll(${JSON.stringify(selector)});
    if (all.length === 0) return null;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    // \`isVisible\` is the walker's (display/visibility/accumulated-opacity/zero-box, composed above); the
    // VIEWPORT half is snap's own question and stays here — the walk judges a whole document, this arm
    // judges the one target a caller named and must refuse a target nobody can look at.
    function inViewport(node) {
      if (!isVisible(node)) return false;
      var r = node.getBoundingClientRect();
      return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
    }
    var el = null;
    var matchIndex = -1;
    var inViewportCount = 0;
    var firstOccluder = null;
    for (var mi = 0; mi < all.length; mi += 1) {
      if (!inViewport(all[mi])) continue;
      inViewportCount += 1;
      // ONE occluder test, the walker's (\`resolve.ts\` occluderOf) — snap's byte-similar twin retired with
      // the resolver. Same ownership question, same pointer-events:none blindness caveat, one home.
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
    // conversion. \`probeColor\` (composed above, from the walker's resolver) is that probe, memoized
    // through \`parseRgb\`; this arm only needs the rgb STRING the Node side already speaks.
    function rgbText(parsed) {
      return "rgb(" + parsed.r + ", " + parsed.g + ", " + parsed.b + ")";
    }
    function toRgbString(cssColor) {
      var parsed = parseRgb(cssColor);
      return parsed === null ? cssColor : rgbText(parsed);
    }
    function isTransparent(c) { return c === "rgba(0, 0, 0, 0)" || c === "transparent"; }
    // THE ONE RESOLVER, four arms mapped onto this arm's three (see the header for why each way).
    function snapBackdrop(node) {
      var resolved = resolveBackdrop(node);
      if (resolved.kind === "flat") return { kind: "flat", color: rgbText(resolved.color) };
      if (resolved.kind === "unresolved") return { kind: "transparent" };
      return { kind: "indeterminate" };
    }
    var style = getComputedStyle(el);
    var fw = style.fontWeight;
    var fontWeight = fw === "bold" ? 700 : fw === "normal" ? 400 : Number(fw) || 400;
    // ::placeholder blind spot: an EMPTY input/textarea paints its PLACEHOLDER, not its text color —
    // reading style.color measures the (invisible) text color and reports a false PASS. When the field
    // is empty, measure the pseudo-element's color instead (the pixels the eye actually sees).
    //
    // \`placeholderInk\` REPORTS that swap (#2429 item 2). Without it the read above was silently thrown
    // away downstream: an empty textarea has no \`textContent\` and no <svg>, so \`isFillSubject\` routed it
    // to the FILL arm (#1111) and the placeholder colour this branch just resolved never reached a verdict
    // — the composer over art printed a fill-only line (or a NO VERDICT) while the ink a person actually
    // reads went unjudged. The placeholder STRING has to be non-empty too: a field with no placeholder
    // attribute still reports a ::placeholder colour, and that colour paints nothing.
    var tag = el.tagName;
    var colorSource = style.color;
    var placeholderInk = false;
    if ((tag === "INPUT" || tag === "TEXTAREA") && !el.value && (el.placeholder || "").trim().length > 0) {
      var phColor = getComputedStyle(el, "::placeholder").color;
      if (phColor && !isTransparent(phColor)) { colorSource = phColor; placeholderInk = true; }
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
      backdrop: snapBackdrop(el),
      hasText: hasText,
      hasIconInk: hasIconInk,
      placeholderInk: placeholderInk,
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
