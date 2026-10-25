// The treatments a mark or a box takes to show a state, shared by every primitive that carries the matching prop.

/** A quiet breath on a working mark (a recall in flight, a reply being written), for `pulse` on Text and Icon.
 *  Motion-safe only: under reduced motion the mark rests still and its label carries the state. */
export const PULSE = "motion-safe:animate-pulse";

/** A disclosure chevron's half turn while the nearest `group` ancestor's panel is open (a collapsible trigger
 *  stamps `data-panel-open`), so the glyph says which way the section is. */
export const OPEN_TURN = "transition-transform duration-(--motion-base) ease-out-expo group-data-panel-open:rotate-180";

/** Content the reader asked not to see yet (a spoiler): blurred and not selectable until revealed. */
export const SPOILER = "blur-md select-none";
