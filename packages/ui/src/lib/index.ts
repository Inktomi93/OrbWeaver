// Cross-cutting @orb/ui seams with no better single home: the class-merge (cn), the configured
// variant factory (tv), and the reduced-motion live-query hook. Primitives import these from here,
// never a raw lib directly.

export { isSafeColor } from "@orb/kit/safe-color";
export { ACCENT_HOVER } from "./accent-hover";
export { ANCHOR_GAP_INPUT, ANCHOR_GAP_TRIGGER } from "./anchor-gap";
// `cn` + `tv` are ONE module because they must share ONE tailwind-merge config — see class-merge.ts
// for the import-order race that shape kills.
export { cn, tv } from "./class-merge";
export { CONTROL_SIZE } from "./control-size";
export { DISABLED_STATE, DISABLED_STATE_NATIVE } from "./disabled-state";
export { FIELD_CONTROL, FIELD_CONTROL_BOX } from "./field-control";
export {
  FOCUS_RING,
  FOCUS_RING_BARE,
  FOCUS_RING_DESTRUCTIVE,
  FOCUS_RING_HAS,
  FOCUS_RING_INSET,
  FOCUS_RING_ON_POPOVER,
  FOCUS_RING_ON_SIDEBAR,
  FOCUS_RING_WITHIN,
} from "./focus-ring";
export { OVERLAY_ARROW } from "./overlay-arrow";
export { OVERLAY_MOTION } from "./overlay-motion";
export { ITEM_ROW, MODAL_SURFACE, POPUP_SURFACE } from "./popup-surface";
export {
  type PortalContainer,
  PortalContainerContext,
  usePortalContainer,
} from "./portal-container";
export { prefersReducedMotionNow, scrollBehavior } from "./reduced-motion-now";
export { formatResultCount } from "./result-count";
export { SCRIM, SCRIM_BASE } from "./scrim";
export { SELECTION_CONTROL, TOUCH_TARGET_PSEUDO } from "./selection-control";
export { usePrefersReducedMotion } from "./use-prefers-reduced-motion";
export { assertBoundedScrollHeight, GAP_TOKENS, type GapToken, gapPxFor } from "./virtual-gap";
