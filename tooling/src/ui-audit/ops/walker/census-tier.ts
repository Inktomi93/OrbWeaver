// ui-audit in-page walker — segment: DENSITY TIER RESOLUTION (packages/ui/src/styles/tiers.css).
//
// THE QUESTION IS NOT "is this value legal" (source-side gates — no-raw-spacing-in-features,
// no-arbitrary-tw-values, css-length-tokens, no-off-token-inline-style — already prove the AUTHORED
// value is a token). It is "did the RESOLVED pixel match the tier the surface declared". That gap is
// runtime-only: an inline style, a broken `--orb-tier-*` custom-property chain, or a pane that forgot
// its `<Surface>` wrapper are all invisible to a source-side scan and were each responsible for a real
// shipped defect (tiers.css §5's own S5 note: the settings modal's nav rows silently dropped 15px→13px
// because no tier was ever declared on that pane).
//
// THE MECHANISM IS A SELF-ORACLE (owner ruling 2026-09-01) — no hardcoded slot→token table is invented
// here. `tiers.css` sets one `--orb-tier-*` custom property per (tier, concept) pair and every consuming
// rule reads it back, so the SANCTIONED value and the PAINTED value are both already on the page:
//   sanctioned = getComputedStyle(el).getPropertyValue('--orb-tier-island-pad')
//   painted    = getComputedStyle(el).padding
// A disagreement between them is the finding. The EPSILON-vs-THRESHOLD decision, and the census's own
// candidates/judged/withheld/excluded accounting, both live in ../lib/checks-quality.ts
// (checkTierDrift) — this segment gathers raw sanctioned/painted pairs only, never decides pass/fail,
// matching every other family in this walker (severity/threshold verdicts stay unit-testable without a
// browser — ops/walker.ts header).
//
// THE MAPPED PAIRS ARE ENFORCED, NOT ASSERTED (#1003). Which (slot, property, --orb-tier-* var) triples
// this segment censuses is still written by hand below — a walker string cannot import the stylesheet —
// but the copy is no longer trusted: tests/tooling/ui-audit/ops/walker/census-tier.test.ts DERIVES the
// triples from both sides (this string's judgeTier* calls under their querySelectorAll blocks; tiers.css's
// own consuming rules) and reds on either direction — a tiers.css pair nothing here censuses (an
// invisible rule the self-oracle cannot see, which still reads as a clean tier surface) and a pair here
// that tiers.css no longer sets. The instrument that judges the app by its painted values now holds its
// own map to the same standard. Today's set: card-root padding/border-radius, list-row-root|body/markers
// gap, list-row-title font-size/weight/line-height, list-row-subtitle|subtitle-reveal|meta font-size,
// input-root|select-trigger font-size/line-height.
//
// POLARITY (owner ruling 2026-09-01, corrected across three lanes the same day): a slot with no
// `[data-surface-tier]` ancestor is CORRECT BY DESIGN — tiers.css states it keeps its own utility
// default — so it is EXCLUDED (a measurement proving inapplicability; the verdict survives), never
// WITHHELD (no measurement at all, no verdict). Likewise an opt-in that outranks the tier
// (`[data-elevated]`, `[data-nested]`, `[data-title-step=promoted]`, `[data-subtitle-step=label]`) is
// EXCLUDED, not silently compared against the tier's own default (which would be a guaranteed false
// positive: tiers.css's own comments call these opt-ins out as the exact thing that "must be spelled
// HERE, unlayered" because they win). WITHHELD is reserved for a genuinely unresolvable custom-property
// chain — the instrument could not judge, which is itself worth surfacing (a broken var chain is one of
// the two failure classes this rule exists to catch), so the run reports NO VERDICT rather than a clean
// pass.
//
// Raw JS in a template literal (no backticks / dollar-brace — see _shared/browser.ts for why a string,
// not a function). Provenance + attribution: ops/walker.ts. Must run after census-collision.ts (which
// declares `relationalAccounting`) and census-cohort.ts (which declares `excludeRelational` /
// `withholdRelational`) — placed near the end of the composition, after census-region.ts, for the same
// reason every other post-cohort segment is.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

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

  function excludeTierCandidate(reason) {
    relationalAccounting["tier-drift"].candidates += 1;
    excludeRelational(relationalAccounting["tier-drift"], reason);
  }

  function judgeTierLength(el, tier, slot, property, varName, paintedRaw, optedOut) {
    relationalAccounting["tier-drift"].candidates += 1;
    if (optedOut) {
      excludeRelational(relationalAccounting["tier-drift"], "opt-in");
      return;
    }
    var sanctionedRaw = getComputedStyle(el).getPropertyValue(varName).trim();
    var sanctionedValue = tierLengthPx(sanctionedRaw);
    var paintedValue = tierLengthPx((paintedRaw || "").split(" ")[0]);
    if (sanctionedValue === null || paintedValue === null) {
      withholdRelational(relationalAccounting["tier-drift"], "unresolved");
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

  function judgeTierNumber(el, tier, slot, property, varName, paintedRaw, optedOut) {
    relationalAccounting["tier-drift"].candidates += 1;
    if (optedOut) {
      excludeRelational(relationalAccounting["tier-drift"], "opt-in");
      return;
    }
    var sanctionedRaw = getComputedStyle(el).getPropertyValue(varName).trim();
    var sanctionedValue = parseFloat(sanctionedRaw);
    var paintedValue = parseFloat(paintedRaw);
    if (!Number.isFinite(sanctionedValue) || !Number.isFinite(paintedValue)) {
      withholdRelational(relationalAccounting["tier-drift"], "unresolved");
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

  // LEADING IS A UNITLESS RATIO IN THE TOKEN, PX IN THE COMPUTED STYLE (lib/ramp.ts's own lesson, one
  // property over): the leading tokens (--leading-label etc) are bare numbers, but CSSOM reports
  // line-height as a resolved USED value in px regardless of how it was authored. Comparing raw strings
  // would always mismatch on units, not on drift, so both sides are normalized to the same ratio scale
  // here (paintedPx / fontSizePx) before the census ever leaves the page.
  function judgeTierLeading(el, tier, slot, property, varName, style, optedOut) {
    relationalAccounting["tier-drift"].candidates += 1;
    if (optedOut) {
      excludeRelational(relationalAccounting["tier-drift"], "opt-in");
      return;
    }
    var sanctionedRaw = getComputedStyle(el).getPropertyValue(varName).trim();
    var sanctionedValue = parseFloat(sanctionedRaw);
    var paintedLinePx = parseFloat(style.lineHeight);
    var paintedFontPx = parseFloat(style.fontSize);
    if (!Number.isFinite(sanctionedValue) || !Number.isFinite(paintedLinePx) || !Number.isFinite(paintedFontPx) || paintedFontPx === 0) {
      withholdRelational(relationalAccounting["tier-drift"], "unresolved");
      return;
    }
    relationalAccounting["tier-drift"].judged += 1;
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
      excludeTierCandidate("no-surface-tier");
      excludeTierCandidate("no-surface-tier");
      continue;
    }
    var tcStyle = getComputedStyle(tcEl);
    judgeTierLength(tcEl, tcTier, "card-root", "padding", "--orb-tier-island-pad", tcStyle.padding, false);
    var tcRadiusOptOut = tcEl.hasAttribute("data-elevated") || tcEl.hasAttribute("data-nested");
    judgeTierLength(tcEl, tcTier, "card-root", "border-radius", "--orb-tier-island-radius", tcStyle.borderRadius, tcRadiusOptOut);
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
    judgeTierLength(trgEl, trgTier, trgEl.getAttribute("data-slot"), "gap", "--orb-tier-row-gap", getComputedStyle(trgEl).gap, false);
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
    judgeTierLength(tmEl, tmTier, "list-row-markers", "gap", "--orb-tier-row-atom-gap", getComputedStyle(tmEl).gap, false);
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
    var ttOptOut = ttEl.getAttribute("data-title-step") === "promoted";
    var ttStyle = getComputedStyle(ttEl);
    judgeTierLength(ttEl, ttTier, "list-row-title", "font-size", "--orb-tier-row-title-size", ttStyle.fontSize, ttOptOut);
    judgeTierNumber(ttEl, ttTier, "list-row-title", "font-weight", "--orb-tier-row-title-weight", ttStyle.fontWeight, ttOptOut);
    judgeTierLeading(ttEl, ttTier, "list-row-title", "line-height", "--orb-tier-row-title-leading", ttStyle, ttOptOut);
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
    var tgOptOut = tgSlot === "list-row-subtitle" && tgEl.getAttribute("data-subtitle-step") === "label";
    judgeTierLength(tgEl, tgTier, tgSlot, "font-size", "--orb-tier-row-gloss-size", getComputedStyle(tgEl).fontSize, tgOptOut);
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
    judgeTierLength(tfEl, tfTier, tfSlot, "font-size", "--orb-tier-field-size", tfStyle.fontSize, false);
    judgeTierLeading(tfEl, tfTier, tfSlot, "line-height", "--orb-tier-field-leading", tfStyle, false);
  }
`;
