import type { ComponentType, ReactElement } from "react";
import { cn } from "#lib";

// THE ROOM'S ONE TRACK (#213). Every element in a chat room's vertical stack — the transcript rows, the
// composer and its attachment/slash strips, and the above-composer band — resolves its horizontal box
// through THIS string, so the room has exactly one answer to "where is the middle".
//
// It used to be spelled per element, and the three spellings disagreed: the bubble-family row outers
// carried `mx-auto max-w-(--width-shell-content)`, the composer carried the same string independently,
// and flat/hush/document carried a bare `w-full` — so the transcript hard-left-anchored while the composer
// centred. Measured on the owner's own room (design rescoring, 2026-08-18, pane-states): the
// two boxes' centres sat 107px apart at the default pane state, 68px at list-collapsed, 260px at full
// width, and agreed only at the one state where the pane happened to be narrower than the cap. The
// composer visibly slid sideways on every context-panel toggle. Mobile was clean at every state (the
// panels are full-screen views there, not tracks), which is why the defect only ever showed on desktop.
//
// `--width-shell-content` is the user's `chatWidthPct` dial (app-shell.tsx stamps it as a clamp against
// the viewport); `w-full` + `mx-auto` is what makes the box centre in whatever pane the shell hands it.
// The READING MEASURE is a different concern and stays where it lives (globals.css, on the content
// column) — the track owns PLACEMENT, the measure owns LINE LENGTH (the #97 ratification, untouched).
//
// THE CENTRING IS NOT `mx-auto` ANY MORE, AND THAT IS A CRISPNESS FIX, NOT A LAYOUT ONE (#1362, Law 3 of
// docs/law/integer-line-boxes.md). `margin-inline: auto` splits the leftover width in HALF, so an ODD
// remainder puts the whole track — and every promoted layer inside it — on a half pixel. Measured on the
// isolated stage at 1280x800, `--width-shell-content` resolving `clamp(46.625rem, 60dvw, 100dvw)` = 768px
// inside an 893px content pane: remainder 125, half 62.5, track left 437.5, i.e. `left -0.500 device px`
// on the composer's `backdrop-filter` layer AND on every `message-bubble`'s. A composited layer is
// rasterized once at its own sub-pixel offset with baseline snapping OFF, so that half pixel is inherited
// by every glyph in the reading column. The remainder's parity is not ours to control (the pane width is
// the shell grid's and the track width is the reader's own `chatWidthPct` dial), so the fix is to FLOOR the
// start margin and let the end margin absorb the odd pixel — invisible at one pixel, and it is what makes
// the landing integer at every width. `orb-chat-track` is the marker the ONE client-globals rule keys on
// (packages/client/src/styles/globals.css); the class is here rather than the rule, because the rule needs
// `round()` and a percentage-bearing `calc()` that no utility can spell and a feature may not inline.
export const CHAT_TRACK = "orb-chat-track inline-full max-inline-(--width-shell-content)";

/** The composer, its strips and the above-composer band: the same track, capped at the transcript's reading measure so
 *  they never run wider than the content column above them. The chat-width dial still narrows them (`orb-composer-track`
 *  in client globals.css). */
const COMPOSER_TRACK = "orb-composer-track inline-full";

// Echo's track is the shared track plus its art pane: the reader's `chatWidthPct` dial still sets how wide the reading
// runs, and the portrait pane costs extra room on top of it (`orb-echo-track` in client globals.css). It centres on the
// composer's axis, and a pane narrower than the ask degrades to the pane instead of overflowing it.
const ECHO_TRACK = "mx-auto inline-full orb-echo-track";

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

/** Renders `of` on the room's chat track or the composer's track. A feature className may not import or build a class
 *  string, so every carrier goes through this component and the strings above stay in this file. */
export function Track<Props extends Carrier>({ of: Primitive, track, className, ...props }: TrackProps<Props>): ReactElement {
  // TypeScript cannot narrow the rest of a generic intersection back to `Props` once `of` and `track` leave it.
  return (
    <Primitive
      {...(props as unknown as Props)}
      className={cn(
        track === "chat" ? CHAT_TRACK : undefined,
        track === "composer" ? COMPOSER_TRACK : undefined,
        track === "echo" ? ECHO_TRACK : undefined,
        className,
      )}
    />
  );
}
