// Cross-cutting @orb/ui seams with no better single home: the class-merge (cn), the configured
// variant factory (tv), and the reduced-motion live-query hook. Primitives import these from here,
// never a raw lib directly.

export { isRenderableColor, isSafeColor } from "@orb/kit/safe-color";
export { ACCENT_HOVER } from "./accent-hover.ts";
export {
  copyActionName,
  defaultChoiceName,
  dismissActionName,
  editActionName,
  hideActionName,
  moreActionsName,
  recentActivityName,
  removeActionName,
  removeQuotedTitle,
  revealActionName,
  selectActionName,
} from "./action-names.ts";
export type { AmbientScope, BubbleScope, BubbleScopes, PickedFill, PickedFills, ProseInks } from "./ambient-scope.ts";
export { AmbientScopeContext, PROSE_INK_FIELDS } from "./ambient-scope.ts";
export { ANCHOR_GAP_INPUT, ANCHOR_GAP_TRIGGER } from "./anchor-gap.ts";
export type { AriaNameSource } from "./aria-name-source.ts";
export { AVATAR_HEADER_GAP, AVATAR_REACH_GAP, AVATAR_REACH_PADDING } from "./avatar-reach.ts";
export { CARD_CORNERS } from "./card-corners.ts";
// `cn` + `tv` are ONE module because they must share ONE tailwind-merge config — see class-merge.ts
// for the import-order race that shape kills.
export { cn, tv } from "./class-merge.ts";
export { type ClipboardOutcome, writeClipboardText } from "./clipboard.ts";
export { coarsePointerNow, finePointerNow, useCoarsePointer } from "./coarse-pointer-now.ts";
export { CONTROL_BLOCK, CONTROL_INLINE, CONTROL_MIN_BLOCK, CONTROL_SIZE, CONTROL_SIZES, type ControlSize } from "./control-size.ts";
export type { CssMergeTraceSnapshot } from "./css-merge-contract.ts";
export { cssMergeTrace } from "./css-merge-trace.ts";
export { DISABLED_STATE, DISABLED_STATE_NATIVE } from "./disabled-state.ts";
export { FIELD_CONTROL, FIELD_CONTROL_BOX } from "./field-control.ts";
export { CONTROL_INSET, FLOOR, GROW, PASS_THROUGH, PUSH, RUN_INSET, SELF, WRAP } from "./flex-share.ts";
export {
  FOCUS_RING,
  FOCUS_RING_BARE,
  FOCUS_RING_DESTRUCTIVE,
  FOCUS_RING_HAS,
  FOCUS_RING_INSET,
  FOCUS_RING_NONE,
  FOCUS_RING_ON_POPOVER,
  FOCUS_RING_ON_SIDEBAR,
  FOCUS_RING_ON_STATE_RING,
  FOCUS_RING_OUTLINE,
  FOCUS_RING_OUTLINE_INSET,
  FOCUS_RING_WITHIN,
  FOCUS_RING_WITHIN_INSET,
} from "./focus-ring.ts";
export { GROUND, WALLPAPER_PLATE } from "./ground.ts";
export { HOVER_CUE, HOVER_DIM, HOVER_REVEAL, HOVER_YIELD, INERT_UNTIL_HOVER } from "./hover-reveal.ts";
export { createKeyboardInsetReader, subscribeKeyboardInset } from "./keyboard-inset.ts";
export {
  createLiveTokenStore,
  LIVE_TOKEN_ROOT_ATTRIBUTE,
  resolveCanvasColor,
  resolveCssLength,
  resolveCssVar,
} from "./live-token-resolver.ts";
export { mergeRefs } from "./merge-refs.ts";
export { MESSAGE_BUBBLE_BOX, MESSAGE_BUBBLE_FILL } from "./message-bubble.ts";
export { OVERLAY_ARROW } from "./overlay-arrow.ts";
export { OVERLAY_MOTION } from "./overlay-motion.ts";
export { declaresOverlay, OVERLAY_RELATION_ATTRIBUTE } from "./overlay-relation.ts";
export { ACCENT_AURA_PIGMENT, GRADIENT_RING_PIGMENT, SWATCH_LADDER_PIGMENT } from "./pigment-scopes.ts";
export { CORNER, PINNED, PLACED } from "./placed.ts";
export { HIDDEN_AT, SR_ONLY_AT } from "./pointer-visibility.ts";
export { ITEM_ROW, MODAL_SURFACE, POPUP_DESCRIPTION, POPUP_SURFACE } from "./popup-surface.ts";
export {
  type PortalContainer,
  PortalContainerContext,
  usePortalContainer,
} from "./portal-container.ts";
export { READING_INSET } from "./reading-inset.ts";
export { RECEDED, RECEDED_MUTED_SEAT } from "./receded-ink.ts";
export { prefersReducedMotionNow, scrollBehavior } from "./reduced-motion-now.ts";
export { formatResultCount, formatSuggestionCount } from "./result-count.ts";
export { BACKDROP_FILL, SCRIM, SCRIM_BASE } from "./scrim.ts";
export { SCROLL_EDGE_EPSILON_PX, SCROLL_FADE_X_CLASS, SCROLL_FADE_Y_CLASS } from "./scroll-fade.ts";
export { SELECTED_FILL, SELECTED_FILL_PRESSED } from "./selected-fill.ts";
export { SELECTION_CONTROL, TOUCH_TARGET_PSEUDO, TOUCH_TARGET_PSEUDO_STRETCH } from "./selection-control.ts";
export { SELECTION_RAIL, SELECTION_RAIL_TONE } from "./selection-rail.ts";
export { SELECTION_RING_CHECKED, SELECTION_RING_SELECTED } from "./selection-ring.ts";
export { sinHash } from "./sin-hash.ts";
export {
  CAPTION,
  FIELD_LABEL,
  FIELD_ROW,
  FIELD_STACK,
  FILL_PARENT,
  INLINE_FIELD_ROW,
  ROW_STRIP,
  SCROLLER,
  SCROLLER_CHAINED,
  SCROLLER_Y,
  SCROLLER_Y_CHAINED,
  TITLE_STEP,
} from "./slots.ts";
export { ARRIVAL, COLOR_MOTION, OPEN_TURN, PULSE } from "./state-motion.ts";
export { TEXT_ALIGN } from "./text-align.ts";
export { INKS, TONE_ARMS, TONE_TEXT, type ToneInkSelection } from "./tone-ink.ts";
export { TONE_OUTLINE, TONE_SOFT, TONE_TINT_HOVER, TONE_TINT_PRESS } from "./tone-skin.ts";
export { TOUCH_FLOOR_AT_COARSE } from "./touch-floor.ts";
export { usePinnedBarCap } from "./use-pinned-bar-cap.ts";
export { usePrefersLightColorScheme } from "./use-prefers-light-color-scheme.ts";
export { usePrefersReducedMotion } from "./use-prefers-reduced-motion.ts";
export { type ToneStamp, type VariantStampProps, variantAttrs, variantProps } from "./variant-attrs.ts";
export { assertBoundedScrollHeight, type GapToken, gapPxFor, UnboundedScrollHeightError } from "./virtual-gap.ts";
export { CAP, CENTRED, HEIGHT, MAX_HEIGHT, MIN_HEIGHT, MIN_WIDTH, PICTURE_SIZE, TITLE_FLOOR, WIDTH } from "./width.ts";
