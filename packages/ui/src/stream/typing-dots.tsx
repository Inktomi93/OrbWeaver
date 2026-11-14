import type { ReactElement } from "react";
import { INLINE_FIELD_ROW } from "#lib";
import { Text } from "#primitives/text";

export interface TypingDotsProps {
  /** Accessible name for the pending state — the caller supplies domain copy (e.g. "Generating a reply…"). */
  readonly label: string;
  /** A visible status beside the dots (e.g. why the wait is long). It also becomes the announced name. */
  readonly note?: string | undefined;
}

const DOT = "orb-typing-dot shrink-0 rounded-full bg-muted-foreground block-(--size-dot-sm) inline-(--size-dot-sm)";

// The pending "typing" affordance shown before a stream's first token (the ghost row's pre-first-token
// window; a calmer sibling of `StreamShimmer`). Three muted dots pulse via the `orb-typing-dot`
// @keyframes utility in `styles/globals.css` — a Tailwind transition can't express a looping pulse.
// Reduced motion is handled ENTIRELY by the `animation-*: 0.01ms !important` floor (motion-floor.css, the app's
// setting resolved over the OS query): the dots freeze at their resting (non-zero) opacity, still
// visible and static. `aria-label` is required — `role="status"` computes its name from the author.
// The dots themselves are decorative (`aria-hidden`); the container carries the announced name, so a note is
// announced once, as that name. The line's height is `--size-typing-line`, a floor rather than padding around
// the content, so a note in the gloss step shares the line the dots alone set; only a note too long for the width
// wraps and grows the row.
export function TypingDots({ label, note }: TypingDotsProps): ReactElement {
  return (
    <span role="status" aria-label={note ?? label} data-slot="typing-dots" className={`${INLINE_FIELD_ROW} max-inline-full min-block-(--size-typing-line)`}>
      <span aria-hidden="true" className={DOT} />
      <span aria-hidden="true" className={DOT} />
      <span aria-hidden="true" className={DOT} />
      {note === undefined ? null : (
        <Text as="span" aria-hidden="true" data-slot="typing-dots-note" voice="gloss" className="min-inline-0">
          {note}
        </Text>
      )}
    </span>
  );
}
