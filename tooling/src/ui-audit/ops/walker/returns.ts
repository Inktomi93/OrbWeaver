// ui-audit in-page walker — segment: the sample-object return — the ONE shape RawSamples mirrors.
// One IIFE, segmented by rule family for the tooling-size cap: ops/walker.ts concatenates the
// segments IN ORDER into COLLECT_SAMPLES_JS, so scope/hoisting behavior is byte-identical to the
// pre-split monolith. Raw JS in a template literal (no backticks / dollar-brace — see
// _shared/browser.ts for why a string, not a function). Provenance + attribution: ops/walker.ts.
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

export const WALKER_RETURNS = `  var pendingWalkMutations = walkObserver.takeRecords();
  for (var pwm = 0; pwm < pendingWalkMutations.length; pwm += 1) {
    if (mutationCarriesElement(pendingWalkMutations[pwm])) walkMutationCount += 1;
  }
  walkObserver.disconnect();
  var finalSubjects = [].slice.call(document.querySelectorAll("*"));
  var settledSubjectSet = new Set(settledSubjects);
  var finalSubjectSet = new Set(finalSubjects);
  var addedSubjects = 0;
  var detachedSubjects = 0;
  for (var fs = 0; fs < finalSubjects.length; fs += 1) {
    if (!settledSubjectSet.has(finalSubjects[fs])) addedSubjects += 1;
  }
  for (var ss = 0; ss < settledSubjects.length; ss += 1) {
    if (!finalSubjectSet.has(settledSubjects[ss])) detachedSubjects += 1;
  }
  var subjectAccounting = {
    observed: preWalkSettlement.count,
    settled: settledSubjects.length,
    stabilized: preWalkSettlement.stabilized,
    settleMutations: preWalkSettlement.mutations,
    walked: allEls.length,
    renderedSubjects: renderedSubjects,
    retainedHiddenSubjects: retainedHiddenSubjects,
    skipped: { documentHead: documentHeadSkips, devChrome: devChromeSkips },
    inaccessible: inaccessibleSubjects,
    final: finalSubjects.length,
    added: addedSubjects,
    detached: detachedSubjects,
    walkMutations: walkMutationCount,
  };
  return {
    subjectAccounting: subjectAccounting,
    themeRender: themeRender,
    texts: texts,
    images: images,
    buriedRasters: buriedRasters,
    tapTargets: tapTargets,
    accessibleNames: accessibleNames,
    unreachableHints: unreachableHints,
    actionDoors: actionDoors,
    controlAspects: controlAspects,
    borderContrasts: borderContrasts,
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
    fontCensus: { faces: fontFaces, probeUsable: faceProbeUsable, sizes: Object.keys(fontSizes).map(Number) },
    brokenImages: brokenImages,
    headings: headings,
    overflows: overflows,
    repeatedTexts: repeatedTexts,
    clippedOverflows: clippedOverflows,
    edgeFlushCards: edgeFlushCards,
    truncatedTexts: truncatedTexts,
    obscuredTargets: obscuredTargets,
    obscuredScan: obscuredScan,
    headlineOverhangs: headlineOverhangs,
    inlinePaddingLeaks: inlinePaddingLeaks,
    cohortAnatomies: cohortAnatomies,
    rowVoids: rowVoids,
    selectionIdioms: selectionIdioms,
    paneInks: paneInks,
    tierDrifts: tierDrifts,
    offGridTexts: offGridTexts,
    promotedLayerOffsets: promotedLayerOffsets,
    offGridTransforms: offGridTransforms,
    quietStates: quietStates,
    emptyStates: emptyStates,
    relationalAccounting: relationalAccounting,
    censusCaps: censusCaps,
    documentFrame: documentFrame,
  };
`;
