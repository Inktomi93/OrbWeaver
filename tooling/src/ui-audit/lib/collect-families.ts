// The eight FAMILY CHECKERS the collect dispatcher runs — one function per `DesignAuditRuleFamily`,
// each wiring its rules through the rung the RUNG ASSIGNMENT TABLE in collect.ts's header assigns them.
// Split out of collect.ts (#1027) when that table grew a row per registered rule and the pair crossed
// the tooling-size cap: collect.ts keeps the table and the closed dispatcher (the facts a reader comes
// to it for), this file keeps the wiring those facts describe.
//
// A FAMILY CHECKER NEVER DECIDES A RULE'S SEMANTICS. Thresholds, severities and the withheld/excluded
// polarity all live in `checks-*.ts` beside the detector; this file only chooses the collection strategy
// and joins the population rows. Provenance/attribution: collect.ts header.
import type { Finding, PopulationAccounting } from "../contract/findings.ts";
import type { RawSamples } from "../contract/samples.ts";
import type { FamilyCheckResult } from "../contract/types.ts";
import { checkObscuredTarget, checkTapTargetPopulations, classifyControlAspect } from "./checks-a11y.ts";
import { checkAccessibleName, checkHeadingOrder, checkMainLandmark, checkTabIndexSmell, classifyUnreachableHint } from "./checks-a11y-navigability.ts";
import { classifyBorderContrast } from "./checks-border.ts";
import { classifyCaveatHierarchy } from "./checks-caveat.ts";
import { checkContrast, checkGrayOnColor, checkQuietState, colorTextPopulations } from "./checks-color.ts";
import { classifyAccentBorder, classifyGlowShadow } from "./checks-decor.ts";
import { checkDuplicateDoorPopulations } from "./checks-duplicate-door.ts";
import { checkFontCensus, fontCensusPopulations } from "./checks-font-census.ts";
import { checkOffGridText, checkOffGridTransform, checkPromotedLayerOffset } from "./checks-grid.ts";
import { checkHoverContrast, hoverContrastPopulations } from "./checks-hover.ts";
import { checkBrokenImage, checkBuriedRasterPopulations, classifyImageDistortion } from "./checks-media.ts";
import { checkIconTile, classifyBgPattern, classifyMotionStatic, classifyRadialGlow } from "./checks-ornament.ts";
import {
  checkClippedOverflow,
  checkDoubleEmptyState,
  checkEdgeFlush,
  checkHeadlineOverhang,
  checkInlinePaddingLeak,
  checkRepeatedText,
  checkTextOverflow,
  checkTierDrift,
  checkTruncatedText,
} from "./checks-quality.ts";
import {
  checkAnimatedImgHover,
  checkCohortAnatomy,
  checkGradientText,
  checkNestedCard,
  checkPaneInk,
  checkRowVoid,
  checkSelectionIdiom,
  checkZIndex,
} from "./checks-structure.ts";
import { checkTextStyle, classifyTextStyle, TEXT_STYLE_RULE_IDS } from "./checks-typography.ts";
import { authoredDecisionKey, capExceeded, emptyFamilyResult, runArray, runNullable, totalJudge } from "./collect-family-runner.ts";
import { accountedFindings, cappedRelationalFindings, decisionPopulationFindings, nullableFindings, partitionedFindings } from "./population-strategies.ts";

export function a11yFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const tapTargets = checkTapTargetPopulations(samples.tapTargets, samples.pointerCoarse);
  if (samples.obscuredScan?.subjects !== undefined && samples.obscuredScan.subjects.length !== samples.obscuredScan.unaskable) {
    throw new Error(
      `INSTRUMENT ERROR: obscured unaskable population=${String(samples.obscuredScan.unaskable)} does not equal named subjects=${String(samples.obscuredScan.subjects.length)}`,
    );
  }
  const obscuredCensus =
    samples.relationalAccounting?.["obscured-target"] ??
    (samples.obscuredScan === undefined
      ? undefined
      : {
          candidates: samples.obscuredScan.candidates,
          judged: samples.obscuredScan.candidates - samples.obscuredScan.unaskable,
          withheld: { unaskable: samples.obscuredScan.unaskable },
          excluded: {},
        });
  const obscured = decisionPopulationFindings("obscured-target", samples.obscuredTargets ?? [], checkObscuredTarget, {
    decisionKey: (input) =>
      `${input.authoredTarget ?? input.selector}\u0000${input.authoredHome ?? input.selector}\u0000${input.hitAuthoredTarget ?? input.hitSelector}\u0000${
        input.hitAuthoredHome ?? input.hitSelector
      }`,
    census: obscuredCensus,
  });
  // The roled-element census is EVERY explicitly-roled visible box, so `control-aspect` publishes a
  // partition (the roles this lens does not govern are a closed exclusion) rather than a bare zero.
  const controlAspects = partitionedFindings("control-aspect", samples.controlAspects ?? [], classifyControlAspect);
  // The boundary census is the SAME shape one rule over (#1361/#1315): every censused form control is
  // partitioned, so a surface whose fields all declare no border prints `excluded(noDeclaredBorder=N)`
  // rather than a zero a reader cannot tell from a census that never ran.
  const borderContrasts = partitionedFindings("border-contrast", samples.borderContrasts ?? [], classifyBorderContrast);
  const names = totalJudge("aria-name", samples.accessibleNames, checkAccessibleName);
  // #2452: the census is EVERY visible Base UI tooltip trigger and most of them are proven out of scope
  // (the tooltip repeats the control's own name, or a description already resolves), so this publishes a
  // PARTITION — a clean surface prints its exclusions rather than a zero a reader cannot tell from a
  // census that never ran. A fine-pointer pass withholds the whole population by name.
  const unreachableHints = partitionedFindings("unreachable-hint", samples.unreachableHints ?? [], classifyUnreachableHint);
  const tabIndexes = totalJudge("tabindex-positive", samples.tabIndexes, checkTabIndexSmell);
  // Accounting-only (#1077): no items, no checker — `census-interactive.ts`'s `restHiddenRevealFine`
  // count is the whole rule, carried entirely on `relationalAccounting`'s WITHHELD reason.
  const revealCoverage = accountedFindings<never>("reveal-coverage", [], () => null, {
    census: samples.relationalAccounting?.["reveal-coverage"],
    samplesAreJudged: false,
  });
  runArray(state, () => tapTargets.findings);
  runArray(state, () => controlAspects.findings);
  runArray(state, () => borderContrasts.findings);
  runArray(state, () => names.findings);
  runArray(state, () => unreachableHints.findings);
  runNullable(state, () => checkMainLandmark({ main: samples.mainLandmarkPresent }));
  runArray(state, () => tabIndexes.findings);
  runArray(state, () => checkHeadingOrder(samples.headings));
  runArray(state, () => obscured.findings);
  runArray(state, () => revealCoverage.findings);
  return {
    ...state,
    populationAccounting: {
      "aria-name": names.accounting,
      "border-contrast": borderContrasts.accounting,
      "control-aspect": controlAspects.accounting,
      "obscured-target": obscured.accounting,
      "reveal-coverage": revealCoverage.accounting,
      "tabindex-positive": tabIndexes.accounting,
      "unreachable-hint": unreachableHints.accounting,
      "tap-target": tapTargets.accounting,
    },
  };
}

export function colorFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const quiet = accountedFindings("quiet-state", samples.quietStates ?? [], checkQuietState, {
    census: samples.relationalAccounting?.["quiet-state"],
    samplesAreJudged: true,
  });
  // The FORCED-STATE family (ops/hover.ts). Its samples come from their own CDP-driven pass, so an absent
  // `hoverScan` is "the pass did not run" and publishes NO row — never a zero that reads as "checked".
  const hoverScan = samples.hoverScan;
  const hoverStates = samples.hoverStates ?? [];
  runArray(state, () => nullableFindings(samples.texts, checkContrast));
  runArray(state, () => nullableFindings(samples.texts, checkGrayOnColor));
  runArray(state, () => quiet.findings);
  runArray(state, () => nullableFindings(hoverStates, checkHoverContrast));
  return {
    ...state,
    populationAccounting: {
      ...colorTextPopulations(samples.texts),
      "quiet-state": quiet.accounting,
      ...(hoverScan === undefined ? {} : { "hover-contrast": hoverContrastPopulations(hoverStates, hoverScan) }),
    },
  };
}

export function decorFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  // ONE detector, TWO rules, TWO denominators: a single edge can be both tells, so each rule extracts
  // its own verdict from the same run and publishes the same censused candidate count.
  const sideTabs = partitionedFindings(
    "side-tab",
    samples.accentBorders,
    (input) => classifyAccentBorder(input, "side-tab"),
    capExceeded(samples, "accentBorders"),
  );
  const rounded = partitionedFindings(
    "border-accent-on-rounded",
    samples.accentBorders,
    (input) => classifyAccentBorder(input, "border-accent-on-rounded"),
    capExceeded(samples, "accentBorders"),
  );
  const glows = partitionedFindings("glow-shadow", samples.shadowGlows, classifyGlowShadow, capExceeded(samples, "shadowGlows"));
  runArray(state, () => sideTabs.findings);
  runArray(state, () => rounded.findings);
  runArray(state, () => glows.findings);
  return {
    ...state,
    populationAccounting: {
      "border-accent-on-rounded": rounded.accounting,
      "glow-shadow": glows.accounting,
      "side-tab": sideTabs.accounting,
    },
  };
}

export function mediaFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const buriedRasters = checkBuriedRasterPopulations(samples.buriedRasters ?? []);
  const distorted = partitionedFindings("distorted-image", samples.images, classifyImageDistortion);
  // Accounting-only (#1079): canvas ink is EXCLUDED, never a silent zero (census-collision.ts's count).
  const canvasInk = accountedFindings<never>("canvas-ink", [], () => null, { census: samples.relationalAccounting?.["canvas-ink"], samplesAreJudged: false });
  runArray(state, () => distorted.findings);
  runArray(state, () => samples.brokenImages.map(checkBrokenImage));
  runArray(state, () => buriedRasters.findings);
  runArray(state, () => canvasInk.findings);
  return {
    ...state,
    populationAccounting: { "buried-raster": buriedRasters.accounting, "canvas-ink": canvasInk.accounting, "distorted-image": distorted.accounting },
  };
}

export function ornamentFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const halos = partitionedFindings(
    "radial-halo",
    samples.radialGlows,
    (input) => classifyRadialGlow(input, "radial-halo"),
    capExceeded(samples, "radialGlows"),
  );
  const spotlights = partitionedFindings(
    "radial-spotlight-glow",
    samples.radialGlows,
    (input) => classifyRadialGlow(input, "radial-spotlight-glow"),
    capExceeded(samples, "radialGlows"),
  );
  const stripes = partitionedFindings(
    "stripe-background",
    samples.bgPatterns,
    (input) => classifyBgPattern(input, "stripe-background"),
    capExceeded(samples, "bgPatterns"),
  );
  const grids = partitionedFindings(
    "grid-line-background",
    samples.bgPatterns,
    (input) => classifyBgPattern(input, "grid-line-background"),
    capExceeded(samples, "bgPatterns"),
  );
  const tiles = totalJudge("icon-tile-stack", samples.iconTiles, checkIconTile);
  const layouts = partitionedFindings(
    "layout-transition",
    samples.motionStatics,
    (input) => classifyMotionStatic(input, "layout-transition"),
    capExceeded(samples, "motionStatics"),
  );
  const bounces = partitionedFindings(
    "bounce-easing",
    samples.motionStatics,
    (input) => classifyMotionStatic(input, "bounce-easing"),
    capExceeded(samples, "motionStatics"),
  );
  runArray(state, () => halos.findings);
  runArray(state, () => spotlights.findings);
  runArray(state, () => stripes.findings);
  runArray(state, () => grids.findings);
  runArray(state, () => tiles.findings);
  runArray(state, () => layouts.findings);
  runArray(state, () => bounces.findings);
  return {
    ...state,
    populationAccounting: {
      "bounce-easing": bounces.accounting,
      "grid-line-background": grids.accounting,
      "icon-tile-stack": tiles.accounting,
      "layout-transition": layouts.accounting,
      "radial-halo": halos.accounting,
      "radial-spotlight-glow": spotlights.accounting,
      "stripe-background": stripes.accounting,
    },
  };
}

export function qualityFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const duplicateDoors = checkDuplicateDoorPopulations(samples.actionDoors ?? []);
  const emptyStates = accountedFindings("double-empty-state", samples.emptyStates ?? [], checkDoubleEmptyState, {
    census: samples.relationalAccounting?.["double-empty-state"],
    samplesAreJudged: true,
  });
  const truncated = decisionPopulationFindings("truncated-to-nothing", samples.truncatedTexts ?? [], checkTruncatedText, {
    decisionKey: authoredDecisionKey,
    census: samples.relationalAccounting?.["truncated-to-nothing"],
  });
  // The two PLACEMENT-COLLISION arms (#816 ii/iii). Rung 4 rather than rung 2 because both repeat by
  // AUTHORED DECISION, not by instance: one misapplied `tv()` slot leaks on every row it renders, and
  // filing that per row would bury the single fix under its own blast radius.
  const overhangs = decisionPopulationFindings("headline-overhang", samples.headlineOverhangs ?? [], checkHeadlineOverhang, {
    decisionKey: authoredDecisionKey,
    census: samples.relationalAccounting?.["headline-overhang"],
  });
  const paddingLeaks = decisionPopulationFindings("inline-padding-leak", samples.inlinePaddingLeaks ?? [], checkInlinePaddingLeak, {
    decisionKey: authoredDecisionKey,
    census: samples.relationalAccounting?.["inline-padding-leak"],
  });
  // The density-tier self-oracle (packages/ui/src/styles/tiers.css): every judged (element, property)
  // pair, passing or failing, is returned — accountedFindings' samplesAreJudged=true requires the items
  // array to equal the census's own judged count.
  const tierDrift = accountedFindings("tier-drift", samples.tierDrifts ?? [], checkTierDrift, {
    census: samples.relationalAccounting?.["tier-drift"],
    samplesAreJudged: true,
  });
  runArray(state, () => duplicateDoors.findings);
  runArray(state, () => samples.overflows.map(checkTextOverflow));
  runArray(state, () => samples.repeatedTexts.map(checkRepeatedText));
  runArray(state, () => samples.clippedOverflows.map(checkClippedOverflow));
  runArray(state, () => samples.edgeFlushCards.map(checkEdgeFlush));
  runArray(state, () => emptyStates.findings);
  // The #816 collision family: text erased to zero width. Legacy sample bundles may omit its walker
  // census; the collector still publishes a derived zero row so reports never confuse absence with an
  // unreported population contract.
  runArray(state, () => truncated.findings);
  runArray(state, () => overhangs.findings);
  runArray(state, () => paddingLeaks.findings);
  // The device-pixel grid CAUSE arms (docs/law/integer-line-boxes.md §9-§10, crispness Laws 2-3). Rung 4
  // rather than rung 2 because both repeat by AUTHORED DECISION: one promoted `tv()` slot lands off-grid on
  // every row it renders, and filing that per row buries the single fix under its own blast radius.
  const promotedLayers = decisionPopulationFindings("promoted-layer-offset", samples.promotedLayerOffsets ?? [], checkPromotedLayerOffset, {
    decisionKey: authoredDecisionKey,
    census: samples.relationalAccounting?.["promoted-layer-offset"],
  });
  const restTransforms = decisionPopulationFindings("off-grid-transform", samples.offGridTransforms ?? [], checkOffGridTransform, {
    decisionKey: authoredDecisionKey,
    census: samples.relationalAccounting?.["off-grid-transform"],
  });
  runArray(state, () => tierDrift.findings);
  runArray(state, () => promotedLayers.findings);
  runArray(state, () => restTransforms.findings);
  return {
    ...state,
    populationAccounting: {
      "double-empty-state": emptyStates.accounting,
      "off-grid-transform": restTransforms.accounting,
      "promoted-layer-offset": promotedLayers.accounting,
      "duplicate-action-door": duplicateDoors.accounting,
      "headline-overhang": overhangs.accounting,
      "inline-padding-leak": paddingLeaks.accounting,
      "tier-drift": tierDrift.accounting,
      "truncated-to-nothing": truncated.accounting,
    },
  };
}

export function structureFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const zIndexes = totalJudge("z-index-escalation", samples.zIndexes, checkZIndex);
  runArray(state, () => zIndexes.findings);
  runArray(state, () => nullableFindings(samples.nestedCards, checkNestedCard));
  runArray(state, () => nullableFindings(samples.gradientTexts, checkGradientText));
  runArray(state, () => nullableFindings(samples.animatedImgHovers, checkAnimatedImgHover));
  const cohortAnatomy = cappedRelationalFindings(
    "cohort-anatomy",
    samples.cohortAnatomies ?? [],
    checkCohortAnatomy,
    samples.relationalAccounting?.["cohort-anatomy"],
  );
  const rowVoid = cappedRelationalFindings("row-void", samples.rowVoids ?? [], checkRowVoid, samples.relationalAccounting?.["row-void"]);
  const paneInk = cappedRelationalFindings("pane-ink", samples.paneInks ?? [], checkPaneInk, samples.relationalAccounting?.["pane-ink"]);
  const selection = accountedFindings("selection-idiom", samples.selectionIdioms ?? [], checkSelectionIdiom, {
    census: samples.relationalAccounting?.["selection-idiom"],
    samplesAreJudged: false,
  });
  runArray(state, () => cohortAnatomy.findings);
  runArray(state, () => rowVoid.findings);
  runArray(state, () => selection.findings);
  runArray(state, () => paneInk.findings);
  return {
    ...state,
    populationAccounting: {
      "cohort-anatomy": cohortAnatomy.accounting,
      "pane-ink": paneInk.accounting,
      "row-void": rowVoid.accounting,
      "selection-idiom": selection.accounting,
      "z-index-escalation": zIndexes.accounting,
    },
  };
}

export function typographyFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const styleFindings = new Map<(typeof samples.textStyles)[number], readonly Finding[]>();
  for (const input of samples.textStyles) {
    styleFindings.set(input, checkTextStyle(input));
  }
  const decisionKey = (input: (typeof samples.textStyles)[number]): string =>
    `${input.authoredTarget ?? input.selector}\u0000${input.authoredHome ?? input.selector}`;
  const textBelowRamp = decisionPopulationFindings(
    "text-below-ramp",
    samples.textStyles,
    (input) => styleFindings.get(input)?.find(({ rule }) => rule === "text-below-ramp") ?? null,
    { decisionKey, census: undefined },
  );
  const undersizedUiText = decisionPopulationFindings(
    "undersized-ui-text",
    samples.textStyles,
    (input) => styleFindings.get(input)?.find(({ rule }) => rule === "undersized-ui-text") ?? null,
    { decisionKey, census: undefined },
  );
  runArray(state, () => [...textBelowRamp.findings, ...undersizedUiText.findings]);
  const populationAccounting: Record<string, ReturnType<typeof partitionedFindings>["accounting"]> = {};
  for (const rule of TEXT_STYLE_RULE_IDS) {
    const partitioned = partitionedFindings(rule, samples.textStyles, (input) => classifyTextStyle(input, rule));
    populationAccounting[rule] = partitioned.accounting;
    runArray(state, () => partitioned.findings);
  }
  // The Law-4 runtime backstop (docs/law/integer-line-boxes.md §11). Same rung and same key as the two
  // type-floor rules above: a blurred voice is a property of the COMPONENT, not of each render.
  const offGridText = decisionPopulationFindings("off-grid-text", samples.offGridTexts ?? [], checkOffGridText, {
    decisionKey: authoredDecisionKey,
    census: samples.relationalAccounting?.["off-grid-text"],
  });
  const caveats = partitionedFindings("caveat-outweighed", samples.textStyles, classifyCaveatHierarchy(samples.textStyles));
  runArray(state, () => caveats.findings);
  runArray(state, () => checkFontCensus(samples.fontCensus));
  runArray(state, () => offGridText.findings);
  return {
    ...state,
    populationAccounting: {
      ...(populationAccounting as PopulationAccounting),
      "caveat-outweighed": caveats.accounting,
      "off-grid-text": offGridText.accounting,
      "off-theme-font": fontCensusPopulations(samples.fontCensus),
      "text-below-ramp": textBelowRamp.accounting,
      "undersized-ui-text": undersizedUiText.accounting,
    },
  };
}
