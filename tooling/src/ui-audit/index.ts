// ui-audit's programmatic front door — the ONLY way anything reaches this engine (Core-Tooling-Law §2.5,
// §4.2). One tool, one API.
//
// THERE IS NO ui-audit PROGRAM ANY MORE (#1315). The parser, the stage door, the drive queue, the matrix
// projection, the run path and the operator help were DELETED, not deprecated: Snap is the sole rendered
// instrument front door (docs/design/1208-instrument-substrate.md §12.3), the scan is
// `pnpm snap <route> --design-audit`, and this dir is the 14k-line detector engine that arm runs — the
// same shape `motion-audit/index.ts` has carried since its own fold. What survives here is every VERDICT:
// the in-page walker segments, the pixel settle, the forced-state pass, the rule layer, the population
// accounting, the evidence gaps and the printed blocks.
//
// THE WALKER SEGMENTS ARE EXPORTED AS SEGMENTS, on purpose. `WALKER_PRIMITIVES` + `WALKER_RESOLVE` is the
// backdrop resolver WITHOUT the whole-page census, which is what lets Snap's per-selector `--contrast`
// arm ask this engine's question about ONE element (#1325) instead of keeping a second, DOM-ancestor-only
// resolver that was blind to a fixed painted layer. `WALKER_ACCESSIBLE_NAME` is the one spec-ordered
// accessible-name key both the door census and Snap's surface map now compute with (#1324).
export type {
  CandidateDisposition,
  Finding,
  FindingPopulation,
  PopulationAccounting,
  RuleOrigin,
  RulePopulationAccounting,
  Severity,
} from "./contract/findings.ts";
export { PAGE_SUBJECT_SELECTOR, SEVERITIES, WITHHELD_REASONS } from "./contract/findings.ts";
export type { DesignAuditRuleFamily, DesignAuditRuleId, DesignAuditSeverity } from "./contract/rules.ts";
export { DESIGN_AUDIT_RULE_FAMILIES, DESIGN_AUDIT_RULE_IDS, DESIGN_AUDIT_RULES, DESIGN_AUDIT_SEVERITIES } from "./contract/rules.ts";
export type {
  AccentBorderInput,
  AccessibleNameInput,
  ActionDoorInput,
  AnimatedImgHoverInput,
  Backdrop,
  BgPatternInput,
  BorderContrastInput,
  BorderContrastSide,
  BrokenImageInput,
  CensusReachInput,
  ClippedOverflowInput,
  ContrastInput,
  ControlAspectInput,
  EdgeFlushInput,
  FontCensusInput,
  FontFaceInput,
  GlowShadowInput,
  GradientTextInput,
  HeadingSample,
  IconTileInput,
  ImageDistortionInput,
  LandmarkInput,
  MotionStaticInput,
  NestedCardInput,
  ObscuredScanInput,
  ObscuredTargetInput,
  RadialGlowInput,
  RawSamples,
  RepeatedTextInput,
  SubjectAccountingInput,
  TabIndexInput,
  TapTargetInput,
  TextOverflowInput,
  TextStyleInput,
  ThemeRenderInput,
  TruncatedTextInput,
  ZIndexInput,
} from "./contract/samples.ts";
export { BORDER_CONTRAST_SIDES } from "./contract/samples-interactive.ts";
export type { BuriedRasterInput } from "./contract/samples-media.ts";
export type { RelationalCensusAccountingInput } from "./contract/samples-populations.ts";
export type { DriveStateCandidate, FocusStateCandidate, PanelModeCandidate, SurfaceStateAccounting } from "./contract/surface-state.ts";
export { DRIVE_STATE_SPACE, FOCUS_STATE_SPACE, PANEL_MODE_SPACE } from "./contract/surface-state.ts";
export type { BackdropRefusal, DomPopulation, HoverPass, PixelPass, ShellStateSnapshot } from "./contract/types.ts";
export { checkControlAspect, checkObscuredTarget, checkTapTarget, checkTapTargetPopulations, classifyControlAspect } from "./lib/checks-a11y.ts";
export { checkAccessibleName, checkHeadingOrder, checkMainLandmark, checkTabIndexSmell } from "./lib/checks-a11y-navigability.ts";
export { checkBorderContrast, classifyBorderContrast } from "./lib/checks-border.ts";
export { checkCaveatHierarchy, classifyCaveatHierarchy } from "./lib/checks-caveat.ts";
export { checkContrast, checkGrayOnColor } from "./lib/checks-color.ts";
export { checkAccentBorder, checkGlowShadow, classifyAccentBorder, classifyGlowShadow } from "./lib/checks-decor.ts";
export {
  checkDuplicateDoorPopulations,
  checkDuplicateDoors,
  checkStaleDuplicateDoorAllowances,
  DUPLICATE_DOOR_ALLOWANCES,
} from "./lib/checks-duplicate-door.ts";
export { checkFontCensus, fontCensusPopulations } from "./lib/checks-font-census.ts";
export { checkBrokenImage, checkBuriedRaster, checkBuriedRasterPopulations, checkImageDistortion, classifyImageDistortion } from "./lib/checks-media.ts";
export {
  checkBgPattern,
  checkIconTile,
  checkMotionStatic,
  checkRadialGlow,
  classifyBgPattern,
  classifyMotionStatic,
  classifyRadialGlow,
} from "./lib/checks-ornament.ts";
export { checkClippedOverflow, checkEdgeFlush, checkRepeatedText, checkScriptErrors, checkTextOverflow, checkTruncatedText } from "./lib/checks-quality.ts";
export { checkAnimatedImgHover, checkGradientText, checkNestedCard, checkZIndex } from "./lib/checks-structure.ts";
export { checkTextStyle, classifyTextStyle } from "./lib/checks-typography.ts";
export { collectAudit, collectFindings } from "./lib/collect.ts";
export {
  actionsFailedGap,
  censusCapGap,
  censusGap,
  censusThinGap,
  censusTotal,
  failureSurfaceGap,
  instrumentPageErrorGap,
  navErrorGap,
  reachGap,
  readinessGap,
  SAMPLE_COLLECTION_PREFIX,
  themeProvenanceGap,
  walkFailureGap,
} from "./lib/evidence.ts";
export { populationEvidenceGap } from "./lib/population.ts";
export { partitionedFindings } from "./lib/population-strategies.ts";
export { INTERACTIVE_TEXT_FLOOR_PX, LEADING_FLOOR, LEADING_FLOOR_EPSILON, RAMP_FONT_FACES, TEXT_MICRO_PX } from "./lib/ramp.ts";
export { reachRows, surfaceStateRows } from "./lib/result-rows.ts";
export { isAtOrAboveSeverity, isValidSeverity } from "./lib/severity.ts";
export { buildSurfaceStateAccounting, surfaceStateAxisLabel } from "./lib/surface-state.ts";
export { hoverPassLabel, resolveHoverStates } from "./ops/hover.ts";
export { appFailureSurface, rawSamples, shellStateSnapshot } from "./ops/page-validate.ts";
export { resolvePixelBackdrops } from "./ops/pixels.ts";
export {
  backdropRefusalSummary,
  countBySeverity,
  navVerdict,
  populationWithheldSummary,
  printBackdropRefusals,
  printCensusReach,
  printFindingsTable,
  printObscuredScan,
  printPopulationAccounting,
  printSurfaceState,
} from "./ops/report.ts";
export { WALKER_ACCESSIBLE_NAME } from "./ops/walker/accessible-name.ts";
export { WALKER_PRIMITIVES } from "./ops/walker/core.ts";
export { WALKER_RESOLVE } from "./ops/walker/resolve.ts";
export { COLLECT_SAMPLES_JS, WALKER_MUTATION_CARRIES } from "./ops/walker.ts";
