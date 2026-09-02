// ui-audit's programmatic front door — what tests and sibling tools import; the cli fronts this surface.
// One tool, one API (docs/architecture/core/Core-Tooling-Law.md §2.5).
export type {
  CandidateDisposition,
  Finding,
  FindingPopulation,
  PopulationAccounting,
  RuleOrigin,
  RulePopulationAccounting,
  Severity,
} from "./contract/findings.ts";
export { SEVERITIES } from "./contract/findings.ts";
export type { DesignAuditRuleFamily, DesignAuditRuleId, DesignAuditSeverity } from "./contract/rules.ts";
export { DESIGN_AUDIT_RULE_FAMILIES, DESIGN_AUDIT_RULE_IDS, DESIGN_AUDIT_RULES, DESIGN_AUDIT_SEVERITIES } from "./contract/rules.ts";
export type {
  AccentBorderInput,
  AccessibleNameInput,
  ActionDoorInput,
  AnimatedImgHoverInput,
  Backdrop,
  BgPatternInput,
  BrokenImageInput,
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
export type { BuriedRasterInput } from "./contract/samples-media.ts";
export type { RelationalCensusAccountingInput } from "./contract/samples-populations.ts";
export type { DriveStateCandidate, FocusStateCandidate, PanelModeCandidate, SurfaceStateAccounting } from "./contract/surface-state.ts";
export { DRIVE_STATE_SPACE, FOCUS_STATE_SPACE, PANEL_MODE_SPACE } from "./contract/surface-state.ts";
export type { Args, AuditAction, BackdropRefusal, CaptureOutcome, DomPopulation, PixelPass, ShellStateSnapshot } from "./contract/types.ts";
export {
  checkAccessibleName,
  checkControlAspect,
  checkHeadingOrder,
  checkMainLandmark,
  checkObscuredTarget,
  checkTabIndexSmell,
  checkTapTarget,
  checkTapTargetPopulations,
  classifyControlAspect,
} from "./lib/checks-a11y.ts";
export { checkCaveatHierarchy, classifyCaveatHierarchy } from "./lib/checks-caveat.ts";
export { checkContrast, checkGrayOnColor } from "./lib/checks-color.ts";
export { checkAccentBorder, checkGlowShadow, classifyAccentBorder, classifyGlowShadow } from "./lib/checks-decor.ts";
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
export {
  checkClippedOverflow,
  checkDuplicateDoors,
  checkEdgeFlush,
  checkRepeatedText,
  checkScriptErrors,
  checkTextOverflow,
  checkTruncatedText,
} from "./lib/checks-quality.ts";
export { checkAnimatedImgHover, checkGradientText, checkNestedCard, checkZIndex } from "./lib/checks-structure.ts";
export { checkTextStyle, classifyTextStyle } from "./lib/checks-typography.ts";
export { collectFindings } from "./lib/collect.ts";
export {
  actionsFailedGap,
  censusGap,
  censusThinGap,
  censusTotal,
  failureSurfaceGap,
  navErrorGap,
  reachGap,
  readinessGap,
  themeProvenanceGap,
} from "./lib/evidence.ts";
export { partitionedFindings } from "./lib/population-strategies.ts";
export { INTERACTIVE_TEXT_FLOOR_PX, LEADING_FLOOR, LEADING_FLOOR_EPSILON, RAMP_FONT_FACES, TEXT_MICRO_PX } from "./lib/ramp.ts";
export { isAtOrAboveSeverity, isValidSeverity } from "./lib/severity.ts";
export {
  COLD_STAGE_REFUSAL,
  STAGE_DB_NOTE,
  STAGE_WARMUP_NOTE,
  stageArgErrors,
  stageBootedByThisRun,
  stageBootRefusal,
  stageLabel,
  unknownRefRefusal,
} from "./lib/stage-request.ts";
export { buildSurfaceStateAccounting, surfaceStateAxisLabel } from "./lib/surface-state.ts";
export { runUiAuditMatrix } from "./ops/matrix.ts";
export { DESIGN_AUDIT_HELP, parseAuditArgs } from "./ops/parse.ts";
export { runUiAudit } from "./ops/run.ts";
export { configureAuditStage } from "./ops/stage.ts";
export { COLLECT_SAMPLES_JS } from "./ops/walker.ts";
