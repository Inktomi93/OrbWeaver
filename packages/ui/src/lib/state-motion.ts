// The treatments a mark or a box takes to show a state, shared by every primitive that carries the matching prop.

/** A quiet breath on a working mark (a recall in flight, a reply being written), for `pulse` on Text and Icon.
 *  When reduced motion resolves on, the motion floor stills it and the label carries the state. */
export const PULSE = "animate-pulse";

/** A disclosure chevron's half turn while the nearest `group` ancestor's panel is open (a collapsible trigger
 *  stamps `data-panel-open`), so the glyph says which way the section is. */
export const OPEN_TURN = "transition-transform duration-(--motion-base) ease-out-expo group-data-panel-open:rotate-180";

const ARRIVAL_TRANSITION = "transition-[opacity,translate] duration-(--motion-base) ease-out-expo";

/** A list item that genuinely arrives: it mounts at `from` (transparent, one tight step low) and flips to `settle` on the
 *  next frame, so the transition has a state to ease from. Compositor properties only; `translate` must be named because
 *  `transform` does not animate it. */
export const ARRIVAL = {
  from: `${ARRIVAL_TRANSITION} opacity-0 translate-y-tight`,
  settle: ARRIVAL_TRANSITION,
} as const;

/** Content the reader asked not to see yet (a spoiler): blurred and not selectable until revealed. */
export const SPOILER = "blur-md select-none";
