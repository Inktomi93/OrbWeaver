// ui-audit's programmatic front door — what tests and sibling tools import; the cli fronts this surface.
// One tool, one API (docs/architecture/core/Core-Tooling-Law.md §2.5).
export type { Finding, RuleOrigin, Severity } from "./contract/findings.ts";
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
  TabIndexInput,
  TapTargetInput,
  TextOverflowInput,
  TextStyleInput,
  TruncatedTextInput,
  ZIndexInput,
} from "./contract/samples.ts";
export type { Args, AuditAction, BackdropRefusal, CaptureOutcome, DomPopulation, PixelPass } from "./contract/types.ts";
export {
  checkAccessibleName,
  checkControlAspect,
  checkHeadingOrder,
  checkMainLandmark,
  checkObscuredTarget,
  checkTabIndexSmell,
  checkTapTarget,
} from "./lib/checks-a11y.ts";
export { checkContrast, checkGrayOnColor } from "./lib/checks-color.ts";
export { checkAccentBorder, checkGlowShadow } from "./lib/checks-decor.ts";
export { checkBrokenImage, checkImageDistortion } from "./lib/checks-media.ts";
export { checkBgPattern, checkIconTile, checkMotionStatic, checkRadialGlow } from "./lib/checks-ornament.ts";
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
export { checkCaveatHierarchy, checkFontCensus, checkTextStyle } from "./lib/checks-typography.ts";
export { collectFindings } from "./lib/collect.ts";
export { censusGap, censusThinGap, censusTotal, reachGap, readinessGap } from "./lib/evidence.ts";
export { INTERACTIVE_TEXT_FLOOR_PX, LEADING_FLOOR, RAMP_FONT_FACES, TEXT_MICRO_PX } from "./lib/ramp.ts";
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
export { DESIGN_AUDIT_HELP, parseAuditArgs } from "./ops/parse.ts";
export { runUiAudit } from "./ops/run.ts";
export { configureAuditStage } from "./ops/stage.ts";
export { COLLECT_SAMPLES_JS } from "./ops/walker.ts";
