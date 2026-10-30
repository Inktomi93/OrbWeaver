// Compare rendered density slots with their governed tier and variant values from tiers.css.
// Resolve token expressions through the browser and restore every temporary inline-style probe.
import { refuseDirectInvocation } from "../../../floor/cli/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_CENSUS_TIER = `  // ── density tier resolution: does the resolved pixel match the tier map? ──
  var tierDrifts = [];
  relationalAccounting["tier-drift"] = { candidates: 0, judged: 0, withheld: {}, excluded: {} };

  // The epsilon decision (lib/ramp.ts's LEADING_FLOOR_EPSILON precedent, one property over) lives in
  // ../../lib/checks-quality.ts (checkTierDrift) — this segment gathers raw sanctioned/painted facts
  // only, never a pass/fail verdict, matching every other family in this walker.

  function tierSurfaceOf(el) {
    var host = el.closest ? el.closest("[data-surface-tier]") : null;
    return host === null ? null : host.getAttribute("data-surface-tier");
  }

  var tierRootFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

  function tierLengthPx(raw) {
    var s = (raw || "").trim();
    if (s === "") return null;
    if (/rem$/.test(s)) {
      var remVal = parseFloat(s);
      return Number.isFinite(remVal) ? remVal * tierRootFontPx : null;
    }
    if (/px$/.test(s)) {
      var pxVal = parseFloat(s);
      return Number.isFinite(pxVal) ? pxVal : null;
    }
    var bareVal = parseFloat(s);
    return Number.isFinite(bareVal) ? bareVal : null;
  }

  // The sanctioned value, resolved by the ENGINE (see the header for why, and for why the unset check
  // must come first). Returns null when the tier never declared the property at all — the broken-chain
  // case — and otherwise the declared token stream beside the computed value it resolves to.
  function tierSanctioned(el, property, varName) {
    var customProperty = varName.indexOf("--") === 0;
    var declared = customProperty ? getComputedStyle(el).getPropertyValue(varName).trim() : varName;
    if (declared === "") return null;
    var savedStyle = el.getAttribute("style");
    try {
      // The probe must outrank authored important paint; the original declaration is restored below.
      el.style.setProperty(property, customProperty ? "var(" + varName + ")" : declared, "important");
      return { declared: declared, resolved: getComputedStyle(el).getPropertyValue(property) };
    } finally {
      if (savedStyle === null) {
        // Clearing the live CSS declaration first prevents native removal from retaining an empty style attribute.
        el.setAttribute("style", "");
        el.removeAttribute("style");
      } else el.setAttribute("style", savedStyle);
    }
  }

  function excludeTierCandidate(reason) {
    relationalAccounting["tier-drift"].candidates += 1;
    excludeRelational(relationalAccounting["tier-drift"], reason);
  }

  function judgeTierLength(el, tier, slot, property, varName, paintedRaw) {
    relationalAccounting["tier-drift"].candidates += 1;
    var sanctioned = tierSanctioned(el, property, varName);
    if (sanctioned === null) {
      withholdRelational(relationalAccounting["tier-drift"], "unresolved", describe(el));
      return;
    }
    var sanctionedRaw = sanctioned.declared;
    var sanctionedValue = tierLengthPx((sanctioned.resolved || "").split(" ")[0]);
    var paintedValue = tierLengthPx((paintedRaw || "").split(" ")[0]);
    if (sanctionedValue === null || paintedValue === null) {
      withholdRelational(relationalAccounting["tier-drift"], "unresolved", describe(el));
      return;
    }
    relationalAccounting["tier-drift"].judged += 1;
    tierDrifts.push({
      selector: describe(el),
      tier: tier,
      slot: slot,
      property: property,
      varName: varName,
      unit: "px",
      sanctionedRaw: sanctionedRaw,
      paintedRaw: paintedRaw,
      sanctionedValue: sanctionedValue,
      paintedValue: paintedValue,
    });
  }

  function judgeTierNumber(el, tier, slot, property, varName, paintedRaw) {
    relationalAccounting["tier-drift"].candidates += 1;
    var sanctioned = tierSanctioned(el, property, varName);
    if (sanctioned === null) {
      withholdRelational(relationalAccounting["tier-drift"], "unresolved", describe(el));
      return;
    }
    var sanctionedRaw = sanctioned.declared;
    var sanctionedValue = parseFloat(sanctioned.resolved);
    var paintedValue = parseFloat(paintedRaw);
    if (!Number.isFinite(sanctionedValue) || !Number.isFinite(paintedValue)) {
      withholdRelational(relationalAccounting["tier-drift"], "unresolved", describe(el));
      return;
    }
    relationalAccounting["tier-drift"].judged += 1;
    tierDrifts.push({
      selector: describe(el),
      tier: tier,
      slot: slot,
      property: property,
      varName: varName,
      unit: "num",
      sanctionedRaw: sanctionedRaw,
      paintedRaw: paintedRaw,
      sanctionedValue: sanctionedValue,
      paintedValue: paintedValue,
    });
  }

  // LEADING IS COMPARED AS A RATIO, and both sides are normalized by the SAME font-size before the census
  // leaves the page: CSSOM reports line-height as a resolved USED value in px, and so does the sanctioned
  // probe, so dividing each by the element's own font-size compares leading against leading rather than
  // px against a token. (The token itself is a length — see the header; it is the browser, not a parse,
  // that turns it into the px this divides.)
  function judgeTierLeading(el, tier, slot, property, varName, style) {
    relationalAccounting["tier-drift"].candidates += 1;
    var sanctioned = tierSanctioned(el, property, varName);
    if (sanctioned === null) {
      withholdRelational(relationalAccounting["tier-drift"], "unresolved", describe(el));
      return;
    }
    var sanctionedRaw = sanctioned.declared;
    var sanctionedLinePx = parseFloat(sanctioned.resolved);
    var paintedLinePx = parseFloat(style.lineHeight);
    var paintedFontPx = parseFloat(style.fontSize);
    if (!Number.isFinite(sanctionedLinePx) || !Number.isFinite(paintedLinePx) || !Number.isFinite(paintedFontPx) || paintedFontPx === 0) {
      withholdRelational(relationalAccounting["tier-drift"], "unresolved", describe(el));
      return;
    }
    relationalAccounting["tier-drift"].judged += 1;
    var sanctionedValue = Math.round((sanctionedLinePx / paintedFontPx) * 10000) / 10000;
    var paintedValue = Math.round((paintedLinePx / paintedFontPx) * 10000) / 10000;
    tierDrifts.push({
      selector: describe(el),
      tier: tier,
      slot: slot,
      property: property,
      varName: varName,
      unit: "ratio",
      sanctionedRaw: sanctionedRaw,
      paintedRaw: style.lineHeight,
      sanctionedValue: sanctionedValue,
      paintedValue: paintedValue,
    });
  }

  // ── card-root: padding + border-radius ─────────────────────────────────────
  var tierCardRoots = document.querySelectorAll("[data-slot='card-root']");
  for (var tc = 0; tc < tierCardRoots.length; tc += 1) {
    var tcEl = tierCardRoots[tc];
    if (isDevChrome(tcEl) || !isVisible(tcEl)) continue;
    var tcTier = tierSurfaceOf(tcEl);
    if (tcTier === null) {
      for (var tcMissing = 0; tcMissing < 5; tcMissing += 1) excludeTierCandidate("no-surface-tier");
      continue;
    }
    var tcStyle = getComputedStyle(tcEl);
    var tcShape = tcEl.getAttribute("data-shape");
    var tcPadding = tcShape === "float" ? "--spacing-field" : "--orb-tier-island-pad";
    var tcBlockPadding = tcShape === "bubble" ? "--spacing-row" : tcPadding;
    var tcInlinePadding = tcShape === "bubble" ? "--spacing-block" : tcPadding;
    if (tcEl.getAttribute("data-padding") === "none") {
      tcBlockPadding = "0";
      tcInlinePadding = "0";
    }
    judgeTierLength(tcEl, tcTier, "card-root", "padding-block-start", tcBlockPadding, tcStyle.paddingBlockStart);
    judgeTierLength(tcEl, tcTier, "card-root", "padding-block-end", tcBlockPadding, tcStyle.paddingBlockEnd);
    judgeTierLength(tcEl, tcTier, "card-root", "padding-inline-start", tcInlinePadding, tcStyle.paddingInlineStart);
    judgeTierLength(tcEl, tcTier, "card-root", "padding-inline-end", tcInlinePadding, tcStyle.paddingInlineEnd);
    var tcRadius = "--orb-tier-island-radius";
    if (tcEl.hasAttribute("data-elevated")) tcRadius = "--radius-card";
    if (tcEl.hasAttribute("data-nested")) tcRadius = "--radius-inset";
    if (tcShape !== null) tcRadius = "--radius-control";
    if (tcShape === "float" || tcShape === "bubble") tcRadius = "--radius-card";
    if (tcShape === "inset") tcRadius = "--radius-inset";
    if (tcShape === "plate") tcRadius = "--orb-tier-island-radius";
    if (tcShape === "pill") tcRadius = "--radius-full";
    judgeTierLength(tcEl, tcTier, "card-root", "border-radius", tcRadius, tcStyle.borderRadius);
  }

  // ── list-row-root / list-row-body: gap ───────────────────────────────────────
  var tierRowGapEls = document.querySelectorAll("[data-slot='list-row-root'],[data-slot='list-row-body']");
  for (var trg = 0; trg < tierRowGapEls.length; trg += 1) {
    var trgEl = tierRowGapEls[trg];
    if (isDevChrome(trgEl) || !isVisible(trgEl)) continue;
    var trgTier = tierSurfaceOf(trgEl);
    if (trgTier === null) {
      excludeTierCandidate("no-surface-tier");
      continue;
    }
    judgeTierLength(trgEl, trgTier, trgEl.getAttribute("data-slot"), "gap", "--orb-tier-row-gap", getComputedStyle(trgEl).gap);
  }

  // ── list-row-markers: atom gap ────────────────────────────────────────────
  var tierMarkerEls = document.querySelectorAll("[data-slot='list-row-markers']");
  for (var tm = 0; tm < tierMarkerEls.length; tm += 1) {
    var tmEl = tierMarkerEls[tm];
    if (isDevChrome(tmEl) || !isVisible(tmEl)) continue;
    var tmTier = tierSurfaceOf(tmEl);
    if (tmTier === null) {
      excludeTierCandidate("no-surface-tier");
      continue;
    }
    judgeTierLength(tmEl, tmTier, "list-row-markers", "gap", "--orb-tier-row-atom-gap", getComputedStyle(tmEl).gap);
  }

  // ── list-row-title: font-size / weight / leading ─────────────────────────
  var tierTitleEls = document.querySelectorAll("[data-slot='list-row-title']");
  for (var tt = 0; tt < tierTitleEls.length; tt += 1) {
    var ttEl = tierTitleEls[tt];
    if (isDevChrome(ttEl) || !isVisible(ttEl)) continue;
    var ttTier = tierSurfaceOf(ttEl);
    if (ttTier === null) {
      excludeTierCandidate("no-surface-tier");
      excludeTierCandidate("no-surface-tier");
      excludeTierCandidate("no-surface-tier");
      continue;
    }
    var ttPromoted = ttEl.getAttribute("data-title-step") === "promoted";
    var ttStyle = getComputedStyle(ttEl);
    judgeTierLength(ttEl, ttTier, "list-row-title", "font-size", ttPromoted ? "--text-title" : "--orb-tier-row-title-size", ttStyle.fontSize);
    judgeTierNumber(ttEl, ttTier, "list-row-title", "font-weight", ttPromoted ? "--font-weight-semibold" : "--orb-tier-row-title-weight", ttStyle.fontWeight);
    judgeTierLeading(ttEl, ttTier, "list-row-title", "line-height", ttPromoted ? "--leading-title" : "--orb-tier-row-title-leading", ttStyle);
  }

  // ── list-row-subtitle | subtitle-reveal | meta: gloss size ───────────────
  var tierGlossEls = document.querySelectorAll("[data-slot='list-row-subtitle'],[data-slot='list-row-subtitle-reveal'],[data-slot='list-row-meta']");
  for (var tg = 0; tg < tierGlossEls.length; tg += 1) {
    var tgEl = tierGlossEls[tg];
    if (isDevChrome(tgEl) || !isVisible(tgEl)) continue;
    var tgTier = tierSurfaceOf(tgEl);
    if (tgTier === null) {
      excludeTierCandidate("no-surface-tier");
      continue;
    }
    var tgSlot = tgEl.getAttribute("data-slot");
    var tgLabel = tgSlot === "list-row-subtitle" && tgEl.getAttribute("data-subtitle-step") === "label";
    judgeTierLength(tgEl, tgTier, tgSlot, "font-size", tgLabel ? "--text-label" : "--orb-tier-row-gloss-size", getComputedStyle(tgEl).fontSize);
  }

  // ── input-root | select-trigger: field size + leading ────────────────────
  var tierFieldEls = document.querySelectorAll("[data-slot='input-root'],[data-slot='select-trigger']");
  for (var tf = 0; tf < tierFieldEls.length; tf += 1) {
    var tfEl = tierFieldEls[tf];
    if (isDevChrome(tfEl) || !isVisible(tfEl)) continue;
    var tfTier = tierSurfaceOf(tfEl);
    if (tfTier === null) {
      excludeTierCandidate("no-surface-tier");
      excludeTierCandidate("no-surface-tier");
      continue;
    }
    var tfSlot = tfEl.getAttribute("data-slot");
    var tfStyle = getComputedStyle(tfEl);
    var tfTitle = tfSlot === "input-root" && tfEl.getAttribute("data-type-step") === "title";
    judgeTierLength(tfEl, tfTier, tfSlot, "font-size", tfTitle ? "--text-title" : "--orb-tier-field-size", tfStyle.fontSize);
    judgeTierLeading(tfEl, tfTier, tfSlot, "line-height", tfTitle ? "--leading-title" : "--orb-tier-field-leading", tfStyle);
  }
`;
