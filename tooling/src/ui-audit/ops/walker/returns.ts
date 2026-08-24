// ui-audit in-page walker — segment: the sample-object return — the ONE shape RawSamples mirrors.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm design-audit");

export const WALKER_RETURNS = `  return {
    texts: texts,
    images: images,
    tapTargets: tapTargets,
    accessibleNames: accessibleNames,
    actionDoors: actionDoors,
    controlAspects: controlAspects,
    censusReach: censusReach,
    mainLandmarkPresent: mainLandmarkPresent,
    tabIndexes: tabIndexes,
    zIndexes: zIndexes,
    nestedCards: nestedCards,
    gradientTexts: gradientTexts,
    animatedImgHovers: animatedImgHovers,
    pointerCoarse: pointerCoarse,
    textStyles: textStyles,
    accentBorders: accentBorders,
    shadowGlows: shadowGlows,
    radialGlows: radialGlows,
    bgPatterns: bgPatterns,
    iconTiles: iconTiles,
    motionStatics: motionStatics,
    fontCensus: { families: Object.keys(fontFamilies), sizes: Object.keys(fontSizes).map(Number) },
    brokenImages: brokenImages,
    headings: headings,
    overflows: overflows,
    repeatedTexts: repeatedTexts,
    clippedOverflows: clippedOverflows,
    edgeFlushCards: edgeFlushCards,
  };
`;
