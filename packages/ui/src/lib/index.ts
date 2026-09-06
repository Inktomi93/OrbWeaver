// Cross-cutting @orb/ui seams with no better single home: the class-merge (cn), the configured
// variant factory (tv), and the reduced-motion live-query hook. Primitives import these from here,
// never a raw lib directly.

export { isRenderableColor, isSafeColor } from "@orb/kit/safe-color";
export { ACCENT_HOVER } from "./accent-hover.ts";
export { ANCHOR_GAP_INPUT, ANCHOR_GAP_TRIGGER } from "./anchor-gap.ts";
// `cn` + `tv` are ONE module because they must share ONE tailwind-merge config — see class-merge.ts
// for the import-order race that shape kills.
export { CSS_MERGE_FAMILY_NAMES, cn, tv } from "./class-merge.ts";
export { coarsePointerNow } from "./coarse-pointer-now.ts";
export { CHIP_BOX, CONTROL_SIZE } from "./control-size.ts";
export {
  CSS_MERGE_TRACE_INPUT_LIMIT,
  type CssMergeConflict,
  type CssMergeReceipt,
  type CssMergeTraceSnapshot,
  cssMergeTrace,
} from "./css-merge-trace.ts";
export { DISABLED_STATE, DISABLED_STATE_NATIVE } from "./disabled-state.ts";
export { FIELD_CONTROL, FIELD_CONTROL_BOX } from "./field-control.ts";
export {
  FOCUS_RING,
  FOCUS_RING_BARE,
  FOCUS_RING_DESTRUCTIVE,
  FOCUS_RING_HAS,
  FOCUS_RING_INSET,
  FOCUS_RING_ON_POPOVER,
  FOCUS_RING_ON_SELECTED,
  FOCUS_RING_ON_SIDEBAR,
  FOCUS_RING_OUTLINE,
  FOCUS_RING_WITHIN,
  FOCUS_RING_WITHIN_INSET,
} from "./focus-ring.ts";
export { createLiveTokenStore, LIVE_TOKEN_ROOT_ATTRIBUTE, type LiveTokenStore, resolveCssColor, resolveCssVar } from "./live-token-resolver.ts";
export { OVERLAY_ARROW } from "./overlay-arrow.ts";
export { OVERLAY_MOTION } from "./overlay-motion.ts";
export { ITEM_ROW, MODAL_SURFACE, POPUP_SURFACE } from "./popup-surface.ts";
export {
  type PortalContainer,
  PortalContainerContext,
  usePortalContainer,
} from "./portal-container.ts";
export { RECEDED_INK } from "./receded-ink.ts";
export { prefersReducedMotionNow, scrollBehavior } from "./reduced-motion-now.ts";
export { formatResultCount, formatSuggestionCount } from "./result-count.ts";
export { SCRIM, SCRIM_BASE } from "./scrim.ts";
export { SCROLL_FADE_X_CLASS, SCROLL_FADE_Y_CLASS, useScrollFadeX, useScrollFadeY } from "./scroll-fade.ts";
export { SELECTION_CONTROL, TOUCH_TARGET_PSEUDO } from "./selection-control.ts";
export { SELECTION_RAIL } from "./selection-rail.ts";
export { sinHash } from "./sin-hash.ts";
export { usePrefersReducedMotion } from "./use-prefers-reduced-motion.ts";
export {
  STAMPED_VARIANT_AXES,
  type StampedVariantAxis,
  type VariantAxisAttrs,
  type VariantAxisSource,
  type VariantClassRecipe,
  type VariantStampProps,
  variantAttrs,
  variantProps,
} from "./variant-attrs.ts";
export { assertBoundedScrollHeight, GAP_TOKENS, type GapToken, gapPxFor } from "./virtual-gap.ts";
