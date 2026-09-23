// ui-audit in-page walker — segment: the GLOW-LAYER vocabulary. One home for the three questions both
// glow consumers ask — is this pseudo a dedicated glow LAYER, does this element's forced shadow equal the
// ratified `--shadow-cta-glow` token, and what did a forced state ADD over the rest snapshot — read by the
// static census (ops/walker/census-glow.ts) and by the forced-state pass (ops/hover.ts). Design:
// docs/design/state-paint-census.md. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
//
// IT IS A SIBLING OF state-paint.ts, NOT AN ARM OF IT (#2494, docs/law/Core-Tooling-Law.md
// §4.3). It lived inside
// that segment until state-paint.ts reached exactly 450 lines, where `tooling-size` reds on the next field
// and the cheapest legal edit becomes deleting a paragraph to buy a line. The cap is a DECOMPOSITION
// trigger, so the block moved VERBATIM to the file it had always been a distinct vocabulary in — its own
// "one home" header says so, and it was itself moved here from census-glow.ts in 2026-09-01 when the
// forced-state pass became its second consumer.
//
// IT DECLARES ONLY, like its sibling, so its presence in the main walk costs nothing; every glow read stays
// in the consuming segment. It reads page-program globals defined by other segments — `parseRgb`,
// `splitTopLevelArgs`, `describe`, `resolveBackdrop` and `SANCTIONED_GLOW_SEL` — so it must be composed
// into a program that also carries WALKER_CORE/WALKER_RESOLVE/WALKER_TARGET_IDENTITY, which is exactly
// where both compositions place it (immediately after WALKER_STATE_PAINT).
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_STATE_GLOW = `  // ── the glow-layer vocabulary (one home; census-glow + the forced-state glow reads) ──────────
  // THE EXEMPTION IS A DISCIPLINE, NOT A LIST OF PRODUCT NAMES (moved verbatim from census-glow.ts,
  // 2026-09-01, when the forced-state pass became this vocabulary's second consumer — see that
  // file's header for the six-carrier measurement behind the tolerance).
  var PSEUDOS = ["", "::before", "::after"];
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

  // THE RATIFIED CTA-GLOW EXEMPTION (owner, 2026-09-01, ratified with a re-taken composition
  // receipt): a FORCED-STATE element glow whose computed box-shadow equals the value the sanctioned
  // \`--shadow-cta-glow\` token resolves to ON THAT ELEMENT is the deliberate primary-CTA hover
  // treatment (tokens.json \`shadow.cta-glow\`: "the one rationed Ember glow"), not the glow tell. A
  // TOKEN-DERIVATION test, never a component name list: the equality is taken by resolving the token
  // through a probe node appended beside the element (so scoped \`--color-primary\` overrides resolve
  // exactly as they do for the element) and comparing browser-serialized layers, with Tailwind's
  // unset-layer placeholders (\`rgba(0, 0, 0, 0) 0px 0px 0px 0px\`) normalized away on both sides. The
  // ratification premise was RE-MEASURED fresh (2026-09-01, live primary CTA under CDP-forced
  // hover+focus-visible): the computed box-shadow carries the ring pair FIRST and the glow layers
  // after, so the focus ring paints on top and composes — the clobber rationale this exemption would
  // otherwise trip over was retracted in SKILL.md the same day. An element glow that does NOT equal
  // the token — extra layers, a hand-spelled halo, any near-miss — still fires (the two-direction
  // control in tests/tooling/ui-audit/ops/walker/state-paint.int.test.ts).
  // CACHE GRANULARITY IS PER ELEMENT (warm-leg F1, verifier finding 2026-09-01): the first cut
  // keyed this memo on the token's RAW text — one page-global string whenever the raw collides — so
  // a context-dependent resolution (a currentColor/em-carrying token under two colour scopes reads
  // IDENTICAL raw text while the used value differs) reused the FIRST element's serialization for
  // every later one. The failure direction was a FALSE FIRE on the scoped element, never a false
  // exemption — but the promise above ("resolve exactly as they do for the element") must be the
  // mechanism, not a wish: the memo is now keyed on the ELEMENT, and the probe carries the element's
  // OWN raw token text (not a var() re-lookup) so the serialization is taken beside the element it
  // exempts. Pinned by the two-scope currentColor fixture in state-paint.int.test.ts.
  var ctaGlowResolvedCache = new WeakMap();
  function normalizedShadowLayers(text) {
    if (!text || text === "none") return "";
    var layers = splitTopLevelArgs(text);
    var kept = [];
    for (var nl = 0; nl < layers.length; nl += 1) {
      var layer = layers[nl].trim();
      if (layer.indexOf("rgba(0, 0, 0, 0)") === 0 && !/[1-9]/.test(layer)) continue;
      kept.push(layer);
    }
    return kept.join(", ");
  }
  function matchesCtaGlowToken(el, forcedBoxShadow) {
    var raw = getComputedStyle(el).getPropertyValue("--shadow-cta-glow").trim();
    if (raw === "") return false;
    var resolved = ctaGlowResolvedCache.get(el);
    if (resolved === undefined) {
      var host = el.parentElement || document.body;
      var probeEl = document.createElement("div");
      probeEl.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
      probeEl.style.boxShadow = raw;
      host.appendChild(probeEl);
      resolved = normalizedShadowLayers(getComputedStyle(probeEl).boxShadow);
      host.removeChild(probeEl);
      ctaGlowResolvedCache.set(el, resolved);
    }
    return resolved !== "" && resolved === normalizedShadowLayers(forcedBoxShadow);
  }

  /** REST snapshot of everything the forced glow read compares against: per layer (element,
   *  ::before, ::after), the shadow pair and the radial background. Taken at census time so the
   *  forced read can emit ONLY what the state CHANGED — a glow present at rest is the static glow
   *  census's sample, and emitting it again from the forced pass would file one paint twice.
   *  STATED RESIDUAL: a shadow behind a covering \`transition\` reads its rest value at t≈0, so a
   *  transitioned state-gated glow can escape the delta — the same bounded race the contrast side
   *  names \`noHoverChangeButTransitioned\`; glow has no per-sample accounting channel to name it in. */
  function stateGlowSnapshotOf(el) {
    var snap = [];
    for (var gp = 0; gp < PSEUDOS.length; gp += 1) {
      var gs = PSEUDOS[gp] === "" ? getComputedStyle(el) : getComputedStyle(el, PSEUDOS[gp]);
      snap.push({
        boxShadow: gs.boxShadow || "none",
        textShadow: gs.textShadow || "none",
        backgroundImage: gs.backgroundImage || "none",
      });
    }
    return snap;
  }
  /** The rows a forced state ADDS over the rest snapshot, in the exact shapes the static glow
   *  census emits (GlowShadowInput / RadialGlowInput) so lib/checks-decor + lib/checks-ornament
   *  judge them with zero changes. The state rides the selector (\`…[data-selected]::before\`),
   *  the radial census's own pseudo-in-selector spelling one axis up. */
  function stateGlowRowsOf(el, stateSuffix, restSnap) {
    var shadows = [];
    var radials = [];
    for (var gp2 = 0; gp2 < PSEUDOS.length; gp2 += 1) {
      var pStyle = PSEUDOS[gp2] === "" ? getComputedStyle(el) : getComputedStyle(el, PSEUDOS[gp2]);
      if (PSEUDOS[gp2] !== "" && (!pStyle.content || pStyle.content === "none")) continue;
      var bs = pStyle.boxShadow || "none";
      var ts = pStyle.textShadow || "none";
      var rest = restSnap[gp2];
      if ((bs !== "none" || ts !== "none") && (bs !== rest.boxShadow || ts !== rest.textShadow)) {
        var sgBackdrop = resolveBackdrop(el.parentElement || el);
        shadows.push({
          selector: describe(el) + stateSuffix + PSEUDOS[gp2],
          boxShadow: bs === "none" ? "" : bs,
          textShadow: ts === "none" ? "" : ts,
          backdropColor: sgBackdrop.kind === "flat" ? sgBackdrop.color : sgBackdrop.kind === "unresolved" ? sgBackdrop.fallback : null,
          // Three sanctioned forms, one flag: the owner effect carriers, the dedicated pseudo layer,
          // and — element arm only, forced-state only — the token-exact CTA hover glow above.
          sanctioned: !!(
            (el.matches && el.matches(SANCTIONED_GLOW_SEL)) ||
            (PSEUDOS[gp2] !== "" && isDedicatedGlowLayer(pStyle)) ||
            (PSEUDOS[gp2] === "" && matchesCtaGlowToken(el, bs))
          ),
        });
      }
      var rbg = pStyle.backgroundImage || "none";
      if (rbg.indexOf("radial-gradient") !== -1 && rbg !== rest.backgroundImage) {
        var rrect = el.getBoundingClientRect();
        radials.push({
          selector: describe(el) + stateSuffix + PSEUDOS[gp2],
          value: rbg,
          width: rrect.width,
          height: rrect.height,
          sanctioned: !!(el.matches && el.matches(SANCTIONED_GLOW_SEL)),
        });
      }
    }
    return { shadows: shadows, radials: radials };
  }
`;
