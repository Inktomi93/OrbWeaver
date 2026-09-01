// ui-audit in-page walker — segment: the GLOW families — chromatic box/text-shadow glows and
// radial-gradient washes, both swept across the element and its `::before`/`::after` layers.
// Split out of census-decor.ts (2026-09-01) when the pseudo sweep took that file past the tooling-size
// cap — the same rule-family segmentation ops/walker.ts already runs on. The two families move as ONE
// segment because they share the `PSEUDOS` vocabulary: a `var` in a later segment hoists UNDEFINED, so
// separating them would leave whichever ran first reading nothing (ops/walker.ts, "ORDER IS LOAD-BEARING").
// One IIFE, concatenated IN ORDER by ops/walker.ts, so scope/hoisting is byte-identical to the monolith.
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_CENSUS_GLOW = `  // ── chromatic glow shadows incl. pseudo-elements (impeccable dark-glow) ──
  // THE PSEUDO LAYER IS WHERE OUR GLOWS LIVE, SO IT IS WHERE THE RULE MUST LOOK (2026-09-01). This
  // census read \`getComputedStyle(sgel)\` only — the element's OWN box-shadow — while the house pattern
  // for the rationed accent glow is a \`::before\` carrier (checks-decor.ts's own message says so). So the
  // single most likely shape an unsanctioned glow takes was the one shape the rule could not see, and the
  // two glow families were asymmetric for no stated reason: the radial census below has swept
  // \`PSEUDOS\` since it was born. One home for the idiom — \`PSEUDOS\` is declared here and reused there.
  var PSEUDOS = ["", "::before", "::after"];
  // THE EXEMPTION IS A DISCIPLINE, NOT A LIST OF PRODUCT NAMES. Widening SANCTIONED_GLOW_SEL with the
  // six real \`before:shadow-glow\` sites was the obvious move and is the wrong one twice over: the walker
  // hardcodes no feature-component selector by law (the \`CONTROL_SILHOUETTES\` refusal in
  // lib/checks-a11y.ts is the house precedent), and such a list rots the instant a component is renamed —
  // silently, into a wall of false positives on legitimate sites, which is how a tool teaches its readers
  // to discount it.
  //
  // The house form is recognisable STRUCTURALLY: an absolutely-positioned, pointer-events-none,
  // BEHIND-the-content (numeric z-index <= 0), box-inset pseudo with empty \`content\` whose ONLY paint is
  // the shadow — no background colour, no background image, no border, no text. Measured against all six
  // live carriers (discovery/corpus-family-map, discovery/corpus-understanding-invitation,
  // chat/home-hearth-room, config/config-welcome, refinery/focal-treatment, and app-shell/shell.css's
  // active rail button): every one is \`absolute\` + \`pointer-events-none\` + \`-z-10\`/\`z-index:0\` +
  // \`-inset-px\`/\`inset:0\` + \`content:""\` + no other paint. The tolerance is what \`-inset-px\` needs and
  // nothing more.
  //
  // WHAT THIS STILL JUDGES, which is the point of adopting it: a glow on the element itself (unchanged),
  // a pseudo glow that paints OVER content (z-index auto/positive — the copy-paste \`after:inset-0\` with
  // no \`-z-10\`), a pseudo that eats pointer events, a decorative blob that ALSO glows (it carries a
  // background), an offset bloom, and a text-bearing pseudo. STATED RESIDUAL GAP: this cannot judge
  // RATION — a correctly-layered glow repeated across fifty islands reads as sanctioned here. Ration is a
  // count-over-surface question, not a per-sample one, and inventing a threshold now would be tuning.
  var GLOW_LAYER_INSET_TOLERANCE_PX = 4;
  function glowLayerInsetsToBox(pStyle) {
    var insetSides = [pStyle.top, pStyle.right, pStyle.bottom, pStyle.left];
    for (var gli = 0; gli < insetSides.length; gli += 1) {
      var glv = Number.parseFloat(insetSides[gli]);
      if (Number.isNaN(glv) || Math.abs(glv) > GLOW_LAYER_INSET_TOLERANCE_PX) return false;
    }
    return true;
  }
  function isDedicatedGlowLayer(pStyle) {
    if (pStyle.position !== "absolute" && pStyle.position !== "fixed") return false;
    if (pStyle.pointerEvents !== "none") return false;
    var glz = Number.parseFloat(pStyle.zIndex);
    if (Number.isNaN(glz) || glz > 0) return false;
    if ((pStyle.content || "").replace(/["']/g, "").trim() !== "") return false;
    if ((pStyle.backgroundImage || "none") !== "none") return false;
    var glBg = parseRgb(pStyle.backgroundColor);
    if (glBg !== null && glBg.a > 0.05) return false;
    if (
      Number.parseFloat(pStyle.borderTopWidth) > 0 ||
      Number.parseFloat(pStyle.borderRightWidth) > 0 ||
      Number.parseFloat(pStyle.borderBottomWidth) > 0 ||
      Number.parseFloat(pStyle.borderLeftWidth) > 0
    ) {
      return false;
    }
    return glowLayerInsetsToBox(pStyle);
  }
  var shadowGlows = [];
  for (var sg = 0; sg < allEls.length && shadowGlows.length < 200; sg += 1) {
    var sgel = allEls[sg];
    if (!isVisible(sgel)) continue;
    for (var sgp = 0; sgp < PSEUDOS.length; sgp += 1) {
      var sgStyle = PSEUDOS[sgp] === "" ? getComputedStyle(sgel) : getComputedStyle(sgel, PSEUDOS[sgp]);
      if (PSEUDOS[sgp] !== "" && (!sgStyle.content || sgStyle.content === "none")) continue;
      var bs = sgStyle.boxShadow;
      var ts = sgStyle.textShadow;
      if ((bs === "none" || !bs) && (ts === "none" || !ts)) continue;
      var sgBackdrop = resolveBackdrop(sgel.parentElement || sgel);
      shadowGlows.push({
        // The pseudo rides in the selector, the radial census's spelling — a finding a reviewer cannot
        // locate to the LAYER is a finding they will re-derive by hand.
        selector: describe(sgel) + PSEUDOS[sgp],
        boxShadow: bs === "none" ? "" : bs,
        textShadow: ts === "none" ? "" : ts,
        // The dark-glow tell is not a contrast VERDICT — it only asks "is this backdrop dark?" — so it keeps
        // reading the best-effort composite for an unresolved backdrop. Refusing here would silently drop
        // glow findings on every surface with a fixed art layer, which this change never judged.
        backdropColor: sgBackdrop.kind === "flat" ? sgBackdrop.color : sgBackdrop.kind === "unresolved" ? sgBackdrop.fallback : null,
        // Two ways to be sanctioned, one flag (no parallel exemption): the owner effect axes the radial
        // census also honours — one home for "the owner sanctioned this glow" (#983-family) — OR, for a
        // pseudo only, the layering discipline above. The element arm is deliberately untouched by the
        // structural test: an element that paints its OWN accent halo clobbers the focus ring, which is
        // the defect the message names.
        sanctioned: !!((sgel.matches && sgel.matches(SANCTIONED_GLOW_SEL)) || (PSEUDOS[sgp] !== "" && isDedicatedGlowLayer(sgStyle))),
      });
    }
  }

  // ── radial-gradient washes incl. pseudo-elements (impeccable radial-halo /
  //    radial-spotlight-glow; sanctioned owner carriers tagged, judged in checks) ──
  var radialGlows = [];
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

`;
