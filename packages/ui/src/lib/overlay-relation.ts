// A designed overlay: a box whose controls are laid over (or under) the controls of its parent's other children.
// The declaration names the design, so the enlarged-text overlap probe can tell it from a defect; it is not a waiver.

/** The attribute a declaring box carries; its value is an {@link OverlayRelation}. */
export const OVERLAY_RELATION_ATTRIBUTE = "data-overlay-relation";

// Each designed overlay, named for what lies over what.
const OVERLAY_RELATIONS = ["theme-menu-over-cell", "row-actions-over-body", "message-controls-over-art"] as const;
type OverlayRelation = (typeof OVERLAY_RELATIONS)[number];

/**
 * The props that declare a box's controls laid across the controls of its parent's other children.
 *
 * @remarks The declaration covers that one relation: a control of the box over a control anywhere else stays a finding.
 */
export function declaresOverlay(relation: OverlayRelation): { readonly [OVERLAY_RELATION_ATTRIBUTE]: OverlayRelation } {
  return { [OVERLAY_RELATION_ATTRIBUTE]: relation };
}
