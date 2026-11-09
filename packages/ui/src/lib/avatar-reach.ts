// What a transcript row, and the composer that shares its start edge, give up so an avatar chip keeps its whole touch reach clear
// of the scroller's clip and of the bubble: below the `cq-28` step, and at a coarse pointer at any wider step, where the row's own
// inset and gap are under the reach. Below `cq-16` (a pane enlarged by text scale until a line holds a few words) the text keeps the
// room instead and the pane returns to the small inset and gap it had: a reach there would split words. The 44px floor yields there
// as well, because the touch token scales with the text and a square sized on it would overlay the clip and the bubble. The chip is
// the target: the enlarged `size.avatar-sm` is 30px at 125% text, over the 24px minimum of WCAG 2.5.8 and under the 44px floor. A
// reach that holds 44px physical pixels there needs a token that does not scale, a ruling on the touch-target pseudo.
export const AVATAR_REACH_PADDING = "@max-cq-16:px-tight @cq-16:@max-cq-28:px-avatar-reach pointer-coarse:@cq-28:px-avatar-reach";
export const AVATAR_REACH_GAP = "@max-cq-16:gap-field @cq-16:@max-cq-28:gap-avatar-reach pointer-coarse:@cq-28:gap-avatar-reach";
