// Cross-cutting @orb/ui seams with no better single home: the class-merge (cn), the configured
// variant factory (tv), and the reduced-motion live-query hook. Primitives import these from here,
// never a raw lib directly.

export { isSafeColor } from "@orb/kit/safe-color";
export { ACCENT_HOVER } from "./accent-hover.ts";
export { ANCHOR_GAP_INPUT, ANCHOR_GAP_TRIGGER } from "./anchor-gap.ts";
// `cn` + `tv` are ONE module because they must share ONE tailwind-merge config — see class-merge.ts
// for the import-order race that shape kills.
export { cn, tv } from "./class-merge.ts";
export { CONTROL_SIZE } from "./control-size.ts";
export { DISABLED_STATE, DISABLED_STATE_NATIVE } from "./disabled-state.ts";
export { FIELD_CONTROL, FIELD_CONTROL_BOX } from "./field-control.ts";
export {
  FOCUS_RING,
  FOCUS_RING_BARE,
  FOCUS_RING_DESTRUCTIVE,
  FOCUS_RING_HAS,
  FOCUS_RING_INSET,
  FOCUS_RING_ON_POPOVER,
  FOCUS_RING_ON_SIDEBAR,
  FOCUS_RING_OUTLINE,
  FOCUS_RING_WITHIN,
} from "./focus-ring.ts";
export { OVERLAY_ARROW } from "./overlay-arrow.ts";
export { OVERLAY_MOTION } from "./overlay-motion.ts";
export { ITEM_ROW, MODAL_SURFACE, POPUP_SURFACE } from "./popup-surface.ts";
export {
  type PortalContainer,
  PortalContainerContext,
  usePortalContainer,
} from "./portal-container.ts";
export { prefersReducedMotionNow, scrollBehavior } from "./reduced-motion-now.ts";
export { formatResultCount } from "./result-count.ts";
export { SCRIM, SCRIM_BASE } from "./scrim.ts";
export { SELECTION_CONTROL, TOUCH_TARGET_PSEUDO } from "./selection-control.ts";
export { usePrefersReducedMotion } from "./use-prefers-reduced-motion.ts";
export { assertBoundedScrollHeight, GAP_TOKENS, type GapToken, gapPxFor } from "./virtual-gap.ts";
