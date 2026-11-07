import type { ComponentType, ReactElement } from "react";

// The room's one track: the transcript rows, the composer and its strips, and the above-composer band all resolve their horizontal box through this
// stamp, so the room has one answer to where the middle is. The box lives in client globals.css, keyed on `data-track`, because the integer centring
// needs `round()` and a percentage `calc()` no utility can spell. `Track` writes no class, so no class of it reaches a primitive unjudged.

const TRACKS = ["chat", "composer", "echo"] as const;
/** The tracks a room's column can ride. */
export type TrackName = (typeof TRACKS)[number];

interface Carrier {
  readonly className?: string | undefined;
}

export type TrackProps<Props extends Carrier> = Props & {
  /** The primitive that carries the track; a prop other than `as`, which a polymorphic primitive already takes. */
  readonly of: ComponentType<Props>;
  readonly track: TrackName;
};

/** Renders `of` on one of the room's tracks. `of` must hand `data-*` to its element, or the stamp is lost: tests/client/features/chat/lib/chat-track.ct.tsx mounts each carrier. */
export function Track<Props extends Carrier>(props: TrackProps<Props>): ReactElement;
// The generic signature ties `of` to its props for the caller, whose class lint judges against `of`; the body writes none and forwards what it does not read.
export function Track({ of: Primitive, track, ...props }: TrackProps<{ readonly className?: never }>): ReactElement {
  return <Primitive {...props} data-track={track} />;
}
