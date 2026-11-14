import type { ReactElement } from "react";
import { INLINE_FIELD_ROW } from "#lib";
import { Text } from "#primitives/text";

export interface TypingDotsProps {
  /** Accessible name for the pending state — the caller supplies domain copy (e.g. "Generating a reply…"). */
  readonly label: string;
  /** A visible status beside the dots (e.g. why the wait is long). It also becomes the announced name. */
  readonly note?: string | undefined;
}

const DOT = "orb-typing-dot rounded-full bg-muted-foreground block-(--size-dot-sm) inline-(--size-dot-sm)";

// A no-break space holds the note's line while there is no note, so a note appearing or leaving never moves the
// row it sits in or anything below it. Built from its code point so no editor folds it into a plain space.
const NO_BREAK_SPACE = 0xa0;
const HELD_LINE = String.fromCodePoint(NO_BREAK_SPACE);

// The pending "typing" affordance shown before a stream's first token (the ghost row's pre-first-token
// window; a calmer sibling of `StreamShimmer`). Three muted dots pulse via the `orb-typing-dot`
// @keyframes utility in `styles/globals.css` — a Tailwind transition can't express a looping pulse.
// Reduced motion is handled ENTIRELY by the `animation-*: 0.01ms !important` floor (motion-floor.css, the app's
// setting resolved over the OS query): the dots freeze at their resting (non-zero) opacity, still
// visible and static. `aria-label` is required — `role="status"` computes its name from the author.
// The dots themselves are decorative (`aria-hidden`); the container carries the announced name. The note's
// line is always laid out and truncates to one line, so its box is the same with or without a note.
export function TypingDots({ label, note }: TypingDotsProps): ReactElement {
  return (
    <span role="status" aria-label={note ?? label} data-slot="typing-dots" className={`${INLINE_FIELD_ROW} py-field max-inline-full`}>
      <span aria-hidden="true" className={DOT} />
      <span aria-hidden="true" className={DOT} />
      <span aria-hidden="true" className={DOT} />
      <Text as="span" aria-hidden="true" data-slot="typing-dots-note" voice="quiet" truncate={true}>
        {note ?? HELD_LINE}
      </Text>
    </span>
  );
}
