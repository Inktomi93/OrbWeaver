// A designed overlay: the controls of one box laid over the controls of another. Both boxes carry the relation, and one box's
// parent holds the other box. The declaration names the design, so the enlarged-text overlap probe can tell it from a defect;
// it is not a waiver.

/** The attribute a declaring box carries; its value is an {@link OverlayRelation}. */
export const OVERLAY_RELATION_ATTRIBUTE = "data-overlay-relation";

// Each designed overlay, named for what lies over what.
const OVERLAY_RELATIONS = ["theme-menu-over-cell", "row-actions-over-body", "message-controls-over-art"] as const;
type OverlayRelation = (typeof OVERLAY_RELATIONS)[number];

/**
 * The props that declare one side of a designed overlay: the box holding only the controls that lie over, or the box holding
 * only the controls that lie under.
 *
 * @remarks The declaration covers that one relation between two boxes that both declare it. A control of the box over any
 * other control, one of its own box included, stays a finding.
 */
export function declaresOverlay(relation: OverlayRelation): { readonly [OVERLAY_RELATION_ATTRIBUTE]: OverlayRelation } {
  return { [OVERLAY_RELATION_ATTRIBUTE]: relation };
}
