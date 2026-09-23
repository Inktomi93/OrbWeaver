// ui-audit in-page walker — segment: the DEVICE-PIXEL GRID census (docs/law/integer-line-boxes.md
// §9-§11 — the crispness doctrine's Laws 2, 3 and 4).
//
// THE QUESTION IS NOT "is this value legal" — the source-side gates (integer-line-boxes, rest-transform-grid,
// no-raw-spacing-in-features, no-arbitrary-tw-values, css-length-tokens, no-off-token-inline-style) already
// prove the AUTHORED values are tokens. It is "did the RESOLVED raster land on the device-pixel grid". That
// gap is runtime-only by construction: a landing is the product of the live root font-size (the continuous
// `--font-scale` slider), the element's own box, and `devicePixelRatio` — none of which authorship can see.
// Law 1 closed the line-box arithmetic and STILL left seven horizontal residuals on the config list panel;
// this census is the backstop that sees them on any surface at any scale.
//
// THE THREE SUBJECTS ARE DISJOINT, and that is what keeps one defect from being counted three times:
//   off-grid-text        — text elements INSIDE a promotion context (Law 4, the symptom)
//   promoted-layer-offset— the promotion ROOTS themselves (Law 3, the cause: one raster, inherited fraction)
//   off-grid-transform   — elements carrying a non-identity transform AT REST (Law 2's resolved arm)
//
// POLARITY (the census-tier.ts ruling, one property over): text with NO promoting ancestor is EXCLUDED, not
// judged clean — the browser re-snaps its baseline every paint, so its fraction is a measurement proving
// INAPPLICABILITY (the verdict survives). SCREEN-READER-ONLY text is excluded on the same polarity and for
// a stronger reason (#1156): it paints no pixels at all, so "blurred" is unaskable of it. WITHHELD is
// reserved for a landing the instrument could not read (a non-finite rect, an unusable DPR), for a
// transform mid-animation, which has no rest landing yet, and for an sr-only answer that could not be read.
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string, not
// a function; the one interpolation is a deliberate tooling constant, the `INACTIVE_KIND_EXPR` precedent).
// Provenance + attribution: ops/walker.ts. Must run after census-collision.ts (`relationalAccounting`) and
// census-cohort.ts (`excludeRelational`/`withholdRelational`), so it is placed with the other post-cohort
// segments at the end of the composition.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { GRID_READING_SURFACE_SELECTOR_JS } from "../../lib/checks-grid.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_GRID = `  // ── device-pixel grid landings (crispness Laws 2-4) ──────────────────────
  var offGridTexts = [];
  var promotedLayerOffsets = [];
  var offGridTransforms = [];
  relationalAccounting["off-grid-text"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  relationalAccounting["promoted-layer-offset"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };
  relationalAccounting["off-grid-transform"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };

  // The exempt reading surface is spelled ONCE, in ../../lib/checks-grid.ts, and interpolated here — the
  // typed mirror of the integer-line-boxes gate's ARM C row, never a second decision.
  var GRID_READING_SURFACE = ${GRID_READING_SURFACE_SELECTOR_JS};
  var GRID_PROMOTION_MAX_STEPS = 40;

  var gridDpr = window.devicePixelRatio;
  function gridUsableDpr() {
    return typeof gridDpr === "number" && Number.isFinite(gridDpr) && gridDpr > 0;
  }
  // ONE normalization, in the page: |frac| <= 0.5 DEVICE px. A DPR-2 landing on a CSS half-pixel reads 0
  // (crisp); the same CSS box at DPR 1 reads 0.5. That is what makes one Node-side epsilon correct at every
  // DPR arm instead of a per-arm constant.
  function gridDeviceFrac(value) {
    var device = value * gridDpr;
    return device - Math.round(device);
  }

  // THE THREE PROMOTION SHAPES Law 3 names, and only those. A composited layer is rasterized once at its
  // own sub-pixel position, so the browser cannot re-snap the baselines inside it per paint.
  var gridPromotionCache = new WeakMap();
  // ONE promotion vocabulary for BOTH walks. The element pass and the pseudo pass (#1172) read the same
  // three shapes off a computed style; a pseudo-only list would be a second decision about what "promoted"
  // means, and the two would drift the first time Law 3 gains a shape.
  function gridPromotionKindOf(style) {
    var backdrop = style.backdropFilter || style.webkitBackdropFilter || "none";
    var willChange = (style.willChange || "auto").trim();
    if (backdrop !== "none" && backdrop !== "") return "backdrop-filter";
    if (willChange !== "auto" && willChange !== "") return "will-change";
    if (style.transformStyle === "preserve-3d") return "3d";
    if ((style.transform || "none").indexOf("matrix3d") === 0) return "3d";
    return null;
  }
  function gridPromotionKind(el) {
    var known = gridPromotionCache.get(el);
    if (known !== undefined) return known;
    var kind = gridPromotionKindOf(getComputedStyle(el));
    gridPromotionCache.set(el, kind);
    return kind;
  }
  function gridPromotionAncestor(el) {
    var node = el;
    var steps = 0;
    while (node && node.nodeType === 1 && steps < GRID_PROMOTION_MAX_STEPS) {
      var kind = gridPromotionKind(node);
      if (kind !== null) return { kind: kind, el: node };
      node = node.parentElement;
      steps += 1;
    }
    return null;
  }

  // A transform mid-animation has no REST landing to judge (#987: only running/pending animations count —
  // a retained finished animation must not blind the subject forever).
  function gridAnimating(el) {
    if (typeof el.getAnimations !== "function") return false;
    var running = el.getAnimations();
    for (var ga = 0; ga < running.length; ga += 1) {
      var state = running[ga].playState;
      if (state === "running" || state === "pending") return true;
    }
    return false;
  }

  // The resolved matrix, decomposed to what this rule asks about: the two scale components and whether a
  // translation is present. CSSOM hands back "none", "matrix(a,b,c,d,tx,ty)" or "matrix3d(...16 values)".
  function gridMatrixOf(transform, translate) {
    var scaleX = 1;
    var scaleY = 1;
    var translated = false;
    var open = transform.indexOf("(");
    if (open !== -1) {
      var parts = transform.slice(open + 1, transform.lastIndexOf(")")).split(",");
      for (var gm = 0; gm < parts.length; gm += 1) parts[gm] = parseFloat(parts[gm]);
      if (parts.length === 6) {
        scaleX = Math.sqrt(parts[0] * parts[0] + parts[1] * parts[1]);
        scaleY = Math.sqrt(parts[2] * parts[2] + parts[3] * parts[3]);
        translated = parts[4] !== 0 || parts[5] !== 0;
      } else if (parts.length === 16) {
        scaleX = Math.sqrt(parts[0] * parts[0] + parts[1] * parts[1] + parts[2] * parts[2]);
        scaleY = Math.sqrt(parts[4] * parts[4] + parts[5] * parts[5] + parts[6] * parts[6]);
        translated = parts[12] !== 0 || parts[13] !== 0;
      }
    }
    // The INDIVIDUAL translate property is a second writer of the same landing and is reported separately
    // by CSSOM — a matcher reading only \`transform\` is blind to every \`translate: -50% 0\` rule.
    var individual = (translate || "none").trim();
    if (individual !== "none" && individual !== "" && individual !== "0px" && individual !== "0px 0px") translated = true;
    if (!Number.isFinite(scaleX)) scaleX = 1;
    if (!Number.isFinite(scaleY)) scaleY = 1;
    return { scaleX: scaleX, scaleY: scaleY, translated: translated };
  }

  function gridLandingOf(el) {
    var rect = el.getBoundingClientRect();
    if (!gridUsableDpr() || !Number.isFinite(rect.top) || !Number.isFinite(rect.left)) return null;
    return { dpr: gridDpr, topDeviceFrac: gridDeviceFrac(rect.top), leftDeviceFrac: gridDeviceFrac(rect.left) };
  }

  // ── LAW 4: text inside a promotion context ────────────────────────────────
  // textEls is the deduped, visible, dev-chrome-filtered text-bearing set the TEXT census already built.
  for (var gt = 0; gt < textEls.length; gt += 1) {
    var gtEl = textEls[gt];
    relationalAccounting["off-grid-text"].candidates += 1;
    // SCREEN-READER-ONLY TEXT IS OUTSIDE THIS RULE'S POPULATION, and it is tested FIRST because it is the
    // most fundamental proof of inapplicability there is: the node paints no pixels anywhere, so it cannot
    // land off the device-pixel grid and cannot blur, whatever surface or layer it sits in (#1156 — the
    // Characters list pane's \`role=status\` sr-only count span was judged, and reported, as a P2 blur).
    // The predicate is core.ts's ONE \`srOnlyText\`, the same one the text census stamps on its samples —
    // never a second spelling. A null (unreadable box, or a composition that never initialised the
    // predicate) is a WITHHOLDING, which makes the whole run NO VERDICT: this rule's population is
    // defined by the answer, so an unanswered candidate may not be quietly judged.
    var gtSrOnly = typeof srOnlyText === "function" ? srOnlyText(gtEl, null) : null;
    if (gtSrOnly === null) {
      withholdRelational(relationalAccounting["off-grid-text"], "srOnlyUnreadable", describe(gtEl));
      continue;
    }
    if (gtSrOnly) {
      excludeRelational(relationalAccounting["off-grid-text"], "srOnly");
      continue;
    }
    if (gtEl.closest(GRID_READING_SURFACE)) {
      excludeRelational(relationalAccounting["off-grid-text"], "readingSurface");
      continue;
    }
    var gtPromotion = gridPromotionAncestor(gtEl);
    if (gtPromotion === null) {
      excludeRelational(relationalAccounting["off-grid-text"], "snapped");
      continue;
    }
    var gtLanding = gridLandingOf(gtEl);
    if (gtLanding === null) {
      withholdRelational(relationalAccounting["off-grid-text"], "unmeasurable", describe(gtEl));
      continue;
    }
    relationalAccounting["off-grid-text"].judged += 1;
    offGridTexts.push({
      selector: describe(gtEl),
      authoredTarget: authoredTargetClaim(gtEl),
      authoredHome: authoredTargetHome(gtEl),
      dpr: gtLanding.dpr,
      topDeviceFrac: gtLanding.topDeviceFrac,
      leftDeviceFrac: gtLanding.leftDeviceFrac,
      promotion: gtPromotion.kind,
      promotedBy: describe(gtPromotion.el),
      fontSizePx: parseFloat(getComputedStyle(gtEl).fontSize) || 0,
    });
  }

  // ── LAW 3: the promotion roots themselves ─────────────────────────────────
  for (var gp = 0; gp < allEls.length; gp += 1) {
    var gpEl = allEls[gp];
    var gpKind = gridPromotionKind(gpEl);
    if (gpKind === null || !isVisible(gpEl)) continue;
    relationalAccounting["promoted-layer-offset"].candidates += 1;
    var gpLanding = gridLandingOf(gpEl);
    if (gpLanding === null) {
      withholdRelational(relationalAccounting["promoted-layer-offset"], "unmeasurable", describe(gpEl));
      continue;
    }
    relationalAccounting["promoted-layer-offset"].judged += 1;
    promotedLayerOffsets.push({
      selector: describe(gpEl),
      authoredTarget: authoredTargetClaim(gpEl),
      authoredHome: authoredTargetHome(gpEl),
      dpr: gpLanding.dpr,
      topDeviceFrac: gpLanding.topDeviceFrac,
      leftDeviceFrac: gpLanding.leftDeviceFrac,
      promotion: gpKind,
    });
  }

  // ── LAW 3, THE PSEUDO ARM: a promotion carried by ::before / ::after ──────
  // A COHORT THAT LEFT THE DENOMINATOR SILENTLY (#1172, the #987 shape). The pass above walks ELEMENTS and
  // calls getComputedStyle with no pseudo argument, so when the shell panes moved their glass onto a
  // \`::before\` fill layer (#1154) the Characters census went candidates=1 -> candidates=0 and read like a
  // surface with nothing to judge. A pseudo composites exactly like an element: its raster inherits the
  // layer's fractional offset, and Law 4's text sits above it.
  //
  // THE SUBJECT IS THE HOST WITH THE PSEUDO NAMED, because the host is where the repair lands (a pseudo
  // has no box of its own to move). THE LANDING IS DERIVED, NOT GUESSED: only an ABSOLUTELY POSITIONED
  // pseudo whose host provably establishes its containing block has a box this walk can compute
  // (host border-box + border width + the pseudo's own resolved inset). Every other shape — an in-flow
  // pseudo, an \`auto\` inset, a host that is not the containing block — is WITHHELD by name, never judged
  // from the host's own rect: a landing measured off the wrong box is the false-measurement half of the
  // same lie the missing cohort was.
  var GRID_PSEUDOS = ["::before", "::after"];
  function gridHostIsContainingBlock(style) {
    if ((style.position || "static") !== "static") return true;
    if ((style.transform || "none") !== "none" || (style.filter || "none") !== "none") return true;
    if ((style.backdropFilter || style.webkitBackdropFilter || "none") !== "none") return true;
    if ((style.perspective || "none") !== "none") return true;
    if ((style.containerType || "normal") !== "normal") return true;
    var contain = style.contain || "none";
    return contain.indexOf("layout") !== -1 || contain.indexOf("paint") !== -1 || contain.indexOf("strict") !== -1 || contain.indexOf("content") !== -1;
  }
  function gridPseudoLanding(el, hostStyle, pseudoStyle) {
    if ((pseudoStyle.position || "static") !== "absolute" || !gridHostIsContainingBlock(hostStyle)) return null;
    var insetTop = parseFloat(pseudoStyle.top);
    var insetLeft = parseFloat(pseudoStyle.left);
    if (!Number.isFinite(insetTop) || !Number.isFinite(insetLeft)) return null;
    var hostRect = el.getBoundingClientRect();
    // The abs containing block is the host's PADDING box, so the border width is part of the offset.
    var top = hostRect.top + (parseFloat(hostStyle.borderTopWidth) || 0) + insetTop;
    var left = hostRect.left + (parseFloat(hostStyle.borderLeftWidth) || 0) + insetLeft;
    if (!gridUsableDpr() || !Number.isFinite(top) || !Number.isFinite(left)) return null;
    return { dpr: gridDpr, topDeviceFrac: gridDeviceFrac(top), leftDeviceFrac: gridDeviceFrac(left) };
  }
  for (var gs = 0; gs < allEls.length; gs += 1) {
    var gsEl = allEls[gs];
    if (!isVisible(gsEl)) continue;
    var gsHostStyle = getComputedStyle(gsEl);
    for (var gsp = 0; gsp < GRID_PSEUDOS.length; gsp += 1) {
      var gsPseudo = GRID_PSEUDOS[gsp];
      var gsStyle = getComputedStyle(gsEl, gsPseudo);
      var gsContent = gsStyle.content || "none";
      // An ungenerated pseudo is not a subject at all — it has no box and paints nothing.
      if (gsContent === "none" || gsContent === "normal" || gsContent === "") continue;
      if ((gsStyle.display || "none") === "none" || (gsStyle.visibility || "visible") === "hidden") continue;
      var gsKind = gridPromotionKindOf(gsStyle);
      if (gsKind === null) continue;
      relationalAccounting["promoted-layer-offset"].candidates += 1;
      carryRelational(relationalAccounting["promoted-layer-offset"], "pseudo");
      var gsLanding = gridPseudoLanding(gsEl, gsHostStyle, gsStyle);
      if (gsLanding === null) {
        withholdRelational(relationalAccounting["promoted-layer-offset"], "pseudoBoxUnmeasurable", describe(gsEl));
        continue;
      }
      relationalAccounting["promoted-layer-offset"].judged += 1;
      promotedLayerOffsets.push({
        selector: describe(gsEl) + gsPseudo,
        authoredTarget: authoredTargetClaim(gsEl),
        authoredHome: authoredTargetHome(gsEl),
        dpr: gsLanding.dpr,
        topDeviceFrac: gsLanding.topDeviceFrac,
        leftDeviceFrac: gsLanding.leftDeviceFrac,
        promotion: gsKind,
        pseudo: gsPseudo,
      });
    }
  }

  // ── LAW 2 (resolved arm): non-identity transforms at rest ─────────────────
  for (var gx = 0; gx < allEls.length; gx += 1) {
    var gxEl = allEls[gx];
    var gxStyle = getComputedStyle(gxEl);
    var gxTransform = gxStyle.transform || "none";
    var gxTranslate = (gxStyle.translate || "none").trim();
    var gxScale = (gxStyle.scale || "none").trim();
    var gxCarries = gxTransform !== "none" || (gxTranslate !== "none" && gxTranslate !== "") || (gxScale !== "none" && gxScale !== "");
    if (!gxCarries || !isVisible(gxEl)) continue;
    relationalAccounting["off-grid-transform"].candidates += 1;
    if (gridAnimating(gxEl)) {
      withholdRelational(relationalAccounting["off-grid-transform"], "animating", describe(gxEl));
      continue;
    }
    var gxMatrix = gridMatrixOf(gxTransform, gxTranslate);
    if (gxScale !== "none" && gxScale !== "" && gxScale !== "1") {
      var gxScaleParts = gxScale.split(" ");
      gxMatrix.scaleX = parseFloat(gxScaleParts[0]) || gxMatrix.scaleX;
      gxMatrix.scaleY = parseFloat(gxScaleParts.length > 1 ? gxScaleParts[1] : gxScaleParts[0]) || gxMatrix.scaleY;
    }
    if (!gxMatrix.translated && gxMatrix.scaleX === 1 && gxMatrix.scaleY === 1) {
      excludeRelational(relationalAccounting["off-grid-transform"], "identity");
      continue;
    }
    var gxLanding = gridLandingOf(gxEl);
    if (gxLanding === null) {
      withholdRelational(relationalAccounting["off-grid-transform"], "unmeasurable", describe(gxEl));
      continue;
    }
    relationalAccounting["off-grid-transform"].judged += 1;
    offGridTransforms.push({
      selector: describe(gxEl),
      authoredTarget: authoredTargetClaim(gxEl),
      authoredHome: authoredTargetHome(gxEl),
      dpr: gxLanding.dpr,
      topDeviceFrac: gxLanding.topDeviceFrac,
      leftDeviceFrac: gxLanding.leftDeviceFrac,
      transform: gxTransform === "none" ? "translate: " + gxTranslate + " scale: " + gxScale : gxTransform,
      scaleX: gxMatrix.scaleX,
      scaleY: gxMatrix.scaleY,
      translated: gxMatrix.translated,
    });
  }
`;
