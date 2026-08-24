// ui-audit's programmatic front door — what tests and sibling tools import; the cli fronts this surface.
// One tool, one API (docs/design/tooling-package.md §2.5).
export type { Finding, RuleOrigin, Severity } from "./contract/findings.ts";
export { SEVERITIES } from "./contract/findings.ts";
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
  RadialGlowInput,
  RawSamples,
  RepeatedTextInput,
  TabIndexInput,
  TapTargetInput,
  TextOverflowInput,
  TextStyleInput,
  ZIndexInput,
} from "./contract/samples.ts";
export type { Args, AuditAction, BackdropRefusal, CaptureOutcome, PixelPass } from "./contract/types.ts";
export { checkAccessibleName, checkControlAspect, checkHeadingOrder, checkMainLandmark, checkTabIndexSmell, checkTapTarget } from "./lib/checks-a11y.ts";
export { checkContrast, checkGrayOnColor } from "./lib/checks-color.ts";
export { checkAccentBorder, checkGlowShadow } from "./lib/checks-decor.ts";
export { checkBrokenImage, checkImageDistortion } from "./lib/checks-media.ts";
export { checkBgPattern, checkIconTile, checkMotionStatic, checkRadialGlow } from "./lib/checks-ornament.ts";
export { checkClippedOverflow, checkDuplicateDoors, checkEdgeFlush, checkRepeatedText, checkScriptErrors, checkTextOverflow } from "./lib/checks-quality.ts";
export { checkAnimatedImgHover, checkGradientText, checkNestedCard, checkZIndex } from "./lib/checks-structure.ts";
export { checkCaveatHierarchy, checkFontCensus, checkTextStyle } from "./lib/checks-typography.ts";
export { collectFindings } from "./lib/collect.ts";
export { INTERACTIVE_TEXT_FLOOR_PX, LEADING_FLOOR, RAMP_FONT_FACES, TEXT_MICRO_PX } from "./lib/ramp.ts";
export { isAtOrAboveSeverity, isValidSeverity } from "./lib/severity.ts";
export { DESIGN_AUDIT_HELP, parseAuditArgs } from "./ops/parse.ts";
export { runUiAudit } from "./ops/run.ts";
export { COLLECT_SAMPLES_JS } from "./ops/walker.ts";
