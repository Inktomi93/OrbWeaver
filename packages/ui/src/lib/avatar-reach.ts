// What a transcript row, and the composer that shares its start edge, give up so an avatar chip keeps its whole touch reach clear
// of the scroller's clip and of the bubble: below the `cq-28` step, and at a coarse pointer at any wider step, where the row's own
// inset and gap are under the reach. Below `cq-16` (a pane enlarged by text scale until a line holds a few words) the avatar keeps
// a 44px physical floor, `size.touch-target-physical`, which does not scale with the text: the touch token does scale, and a square
// sized on it would outgrow the small inset and gap and cover the clip and the bubble. The enlarged `size.avatar-sm` leaves that
// floor less to reach past the chip, so the inset is `spacing.avatar-reach-physical` there, and the text keeps the rest of the room.
export const AVATAR_REACH_PADDING = "@max-cq-16:px-avatar-reach-physical @cq-16:@max-cq-28:px-avatar-reach pointer-coarse:@cq-28:px-avatar-reach";
export const AVATAR_REACH_GAP = "@max-cq-16:gap-field @cq-16:@max-cq-28:gap-avatar-reach pointer-coarse:@cq-28:gap-avatar-reach";
