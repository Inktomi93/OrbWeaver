// ui-audit in-page walker — segment: the ACCENT-EDGE family (impeccable side-tab /
// border-accent-on-rounded), swept across BOTH spellings this codebase uses for an accent edge: the
// element's own `border-*-width`, and a `::before`/`::after` BAR pinned to one edge of its box.
// Split out of census-decor.ts (2026-09-05, #1103) on the census-glow.ts precedent — the pseudo sweep
// took that file past the tooling-size cap, and an accent edge is one rule family, so it gets one file.
//
// THE PSEUDO BAR IS THE SPELLING THIS TREE ACTUALLY USES (#1103, tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md checklist step 1).
// The census as born read `borderTopWidth/RightWidth/BottomWidth/LeftWidth` on the element and nothing
// else, and reported `side-tab candidates=0 judged=0 affected=0 withheld() excluded()` — a clean-looking
// zero — on the very surface carrying the §6-banned bar it exists to catch. Measured live on the config
// landing (2026-09-02 F12 + its Instrument Delta):
// `[aria-label="Tags"]::after` = `content:""`, `background: oklch(0.72 0.175 52)`, `width: 3px`,
// `height: 252px`, `inset: 0px 503.641px 0px 0px`, `position: absolute`, on a `border-radius: 10px` card
// with a `1px` hairline — the textbook shape of BOTH §6 bans, invisible to a border-width read. The same
// run's positive control says the collector was alive, not dead: on Appearance it reported
// `side-tab candidates=1`. So this was a mechanism mismatch, not a dead rule.
//
// THE HOUSE PAINTS EDGE DECOR ON A PSEUDO LAYER, with receipts on the tree, not by assumption:
// `packages/client/src/styles/globals.css:84` (`.orb-indeterminate-hairline::after` — an absolutely
// positioned bar filled with `var(--color-primary)`), `packages/ui/src/styles/globals.css:377`
// (`[data-slot="tabs-tab"][data-active]::after`) and
// `packages/client/src/features/app-shell/surfaces/shell.css:489` (the active rail button's ring). Two of
// those three are FULL-BOX rings rather than bars and must stay unjudged by this arm — which is what the
// geometry predicate below is for, and what the fixture's negative control pins.
//
// ONE PREDICATE, NOT A SECOND COPY OF THE RULE (tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md checklist step 5). The pseudo arm does
// not re-derive the chroma/alpha/dominance/radius question: it lands a row in the SAME `accentBorders`
// family, shaped as the SAME `AccentBorderInput`, and `lib/checks-decor.ts` judges it with the identical
// `classifyAccentSide`. The bar's measured thickness stands in for the accent side's border width, its
// background colour for that side's border colour, and every other side keeps the HOST's own border —
// so a bar on an already-thick-bordered box correctly fails the dominance gate. The four context flags
// (tab / status / ratified ListRow selection / illustrated-picker art) are read off the host exactly as
// the element arm reads them, so every ratified exemption reaches the new channel on the day it lands —
// including #1642's `artPane`, without which repairing this blindness would have re-opened #1151 (the
// chat-style preview stripes are a PICTURE of an accent edge inside `[data-slot=picker-cell-art]`).
//
// One IIFE, concatenated IN ORDER by ops/walker.ts: this segment reads `accentBorders`-adjacent core
// vocabulary (`allEls`, `isVisible`, `describe`, `capPush`, `parseRgb`, `SELECTION_RAIL_SEL`,
// `PICKER_ART_SEL`, `BORDER_SAFE_TAGS`), so it must sit after WALKER_CORE and WALKER_RESOLVE. Raw JS in
// a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string, not a
// function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_ACCENT = `  // ── accent borders (impeccable side-tab / border-accent-on-rounded) ─────
  // The 200-row bound is a REPRESENTATIVE bound, and the scan runs past it (#1038): \`capPush\` tallies
  // what it dropped so the two rules over this census publish a complete \`candidates=\`. BOTH arms below
  // push into this ONE family, so the bound and its ledger cover the whole accent-edge population.
  var accentBorders = [];
  var ACCENT_BORDER_CAP = 200;
  var ACCENT_SIDES = ["top", "right", "bottom", "left"];
  function accentSideProp(side, suffix) {
    return "border" + side.charAt(0).toUpperCase() + side.slice(1) + suffix;
  }
  for (var ab = 0; ab < allEls.length; ab += 1) {
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
    capPush("accentBorders", accentBorders, ACCENT_BORDER_CAP, {
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
      // The ratified selection-rail accent (issue #485, #1823) — matches on the ELEMENT itself, never an
      // ancestor: a decorative panel nested inside a selected row must keep being judged.
      selectionRail: !!(abel.matches && abel.matches(SELECTION_RAIL_SEL)),
      // The illustrated-picker art aperture (#1642) — ANCESTOR-scoped on purpose, the inverse of the line
      // above: every box inside the picture is part of the picture, and the tell the diagram draws is the
      // very thing the cell exists to show. Keyed on the shared @orb/ui PickerCell slot, so all FOUR
      // illustrated pickers — chat style, density, elevation, theme looks — are one exemption rather
      // than four selectors.
      artPane: !!(abel.closest && abel.closest(PICKER_ART_SEL)),
    });
  }

  // ── accent BARS painted on a ::before / ::after layer (#1103) ────────────
  // A BAR IS THIN ON ONE AXIS, LONG ON THE OTHER, AND PINNED TO AN EDGE. All three clauses are load-
  // bearing, and the third is what keeps the house's OTHER pseudo idiom out of this census: the CTA /
  // active-tab / active-rail gradient RING (packages/ui/src/styles/globals.css:377, shell.css:489) is a
  // full-box \`inset: 0\` layer, so it is neither thin nor short on either axis and never reaches a side.
  // A ring is a border on four sides, which is the one shape §6 does not ban. The thickness ceiling is
  // the checker's own HORIZONTAL_BAND_MAX_PX (12px, lib/checks-decor.ts): past it the thing is a panel,
  // not an edge. The span floor keeps a small floating dot or a corner badge out — an accent EDGE runs
  // the length of the box it decorates.
  //
  // BACKGROUND-COLOR, NOT BACKGROUND-IMAGE, IS THE READ. That is the accent bar's spelling (a flat token
  // fill) and it is ALSO the negative control the naive mechanism would trip on: the gradient rings
  // compute \`background-color: rgba(0, 0, 0, 0)\` and carry their paint in \`background-image\`, so reading
  // the image channel here would convict every ring on the tree. A gradient WASH is already the radial
  // census's question (ops/walker/census-glow.ts) — one home per question.
  //
  // BORDER_SAFE_TAGS and the bare-span guard are DELIBERATELY not applied to this arm. Both exist because
  // a UA stylesheet gives \`<button>\`/\`<input>\`/\`<table>\` a default BORDER that would read as an authored
  // accent; no UA stylesheet gives any element a filled, absolutely-positioned pseudo bar. Applying them
  // here would trade this repair for a fresh false clean on exactly the controls most likely to wear one.
  var ACCENT_BAR_PSEUDOS = ["::before", "::after"];
  var ACCENT_BAR_MAX_THICKNESS_PX = 12;
  var ACCENT_BAR_MIN_SPAN_RATIO = 0.6;
  var ACCENT_BAR_EDGE_TOLERANCE_PX = 2;
  function accentBarPx(value) {
    var n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  // WHICH EDGE, or null for "not a bar". The offsets are read from the computed \`top/right/bottom/left\`
  // rather than from a rect, because a pseudo-element has no node to measure — the tolerance is what
  // \`-inset-px\` and a hairline-inset bar need, and nothing more.
  function accentBarSide(hostRect, pStyle) {
    if (pStyle.position !== "absolute" && pStyle.position !== "fixed") return null;
    var w = accentBarPx(pStyle.width);
    var h = accentBarPx(pStyle.height);
    if (w === null || h === null || w <= 0 || h <= 0) return null;
    var top = accentBarPx(pStyle.top);
    var right = accentBarPx(pStyle.right);
    var bottom = accentBarPx(pStyle.bottom);
    var left = accentBarPx(pStyle.left);
    if (w < h && w <= ACCENT_BAR_MAX_THICKNESS_PX && h >= hostRect.height * ACCENT_BAR_MIN_SPAN_RATIO) {
      if (left !== null && Math.abs(left) <= ACCENT_BAR_EDGE_TOLERANCE_PX) return "left";
      if (right !== null && Math.abs(right) <= ACCENT_BAR_EDGE_TOLERANCE_PX) return "right";
      return null;
    }
    if (h < w && h <= ACCENT_BAR_MAX_THICKNESS_PX && w >= hostRect.width * ACCENT_BAR_MIN_SPAN_RATIO) {
      if (top !== null && Math.abs(top) <= ACCENT_BAR_EDGE_TOLERANCE_PX) return "top";
      if (bottom !== null && Math.abs(bottom) <= ACCENT_BAR_EDGE_TOLERANCE_PX) return "bottom";
      return null;
    }
    return null;
  }
  // The bar stands in for its OWN side only; every other side keeps the host's real border, so the
  // checker's dominance gate still asks its own question against the box the bar actually sits on.
  function accentBarWidths(hostStyle, side, thickness) {
    var out = {};
    for (var wi = 0; wi < ACCENT_SIDES.length; wi += 1) {
      var wside = ACCENT_SIDES[wi];
      out[wside] = wside === side ? thickness : Number.parseFloat(hostStyle[accentSideProp(wside, "Width")]) || 0;
    }
    return out;
  }
  function accentBarColors(hostStyle, side, color) {
    var out = {};
    for (var ci = 0; ci < ACCENT_SIDES.length; ci += 1) {
      var cside = ACCENT_SIDES[ci];
      out[cside] = cside === side ? color : parseRgb(hostStyle[accentSideProp(cside, "Color")]);
    }
    return out;
  }
  for (var abr = 0; abr < allEls.length; abr += 1) {
    var abrEl = allEls[abr];
    if (!isVisible(abrEl)) continue;
    var abrHostStyle = getComputedStyle(abrEl);
    var abrRect = abrEl.getBoundingClientRect();
    for (var abrp = 0; abrp < ACCENT_BAR_PSEUDOS.length; abrp += 1) {
      var abrStyle = getComputedStyle(abrEl, ACCENT_BAR_PSEUDOS[abrp]);
      if (!abrStyle.content || abrStyle.content === "none") continue;
      var abrColor = parseRgb(abrStyle.backgroundColor);
      if (abrColor === null || abrColor.a <= 0) continue;
      var abrSide = accentBarSide(abrRect, abrStyle);
      if (abrSide === null) continue;
      var abrThickness = abrSide === "left" || abrSide === "right" ? accentBarPx(abrStyle.width) : accentBarPx(abrStyle.height);
      var abrHostBg = parseRgb(abrHostStyle.backgroundColor);
      var abrTag = abrEl.tagName.toLowerCase();
      capPush("accentBorders", accentBorders, ACCENT_BORDER_CAP, {
        // The LAYER rides the selector, the glow census's spelling: a finding whose paint a reviewer
        // cannot locate to the pseudo is a finding they will re-derive by hand.
        selector: describe(abrEl) + ACCENT_BAR_PSEUDOS[abrp],
        tag: abrTag,
        widths: accentBarWidths(abrHostStyle, abrSide, abrThickness),
        colors: accentBarColors(abrHostStyle, abrSide, abrColor),
        radius: Number.parseFloat(abrHostStyle.borderTopLeftRadius) || 0,
        badgeLike: abrTag === "span" && !!(abrHostBg && abrHostBg.a > 0.5),
        tabContext: !!(abrEl.closest("[role='tablist'],[role='tab'],nav") || abrEl.getAttribute("aria-selected") !== null),
        statusContext: !!abrEl.closest("[role='status'],[role='alert'],[aria-live]"),
        selectionRail: !!(abrEl.matches && abrEl.matches(SELECTION_RAIL_SEL)),
        artPane: !!(abrEl.closest && abrEl.closest(PICKER_ART_SEL)),
      });
    }
  }

`;
