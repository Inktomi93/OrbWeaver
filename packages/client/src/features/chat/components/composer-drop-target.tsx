// The composer CARD — the compact message-first surface, which is also the media DROP TARGET (#376). Extracted
// from composer.tsx when the drop gesture pushed that file past the component-size cap; the card's paint and
// the drag affordance are one concern (a surface that says what it will accept), so they moved together.
//
// The drop target is the whole card a user aims at, not a separate box. It claims only FILE drags (the
// discrimination lives in `use-composer-media-drop`), which is also what carves it out of the app-shell's
// stray-drop guard: that guard skips an event these handlers have already defaultPrevented, so nothing
// outside the composer loses its navigate-away protection.

import { Icon, ImagePlus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { cn } from "#lib";
import type { ComposerMediaDrop } from "../hooks/use-composer-media-drop.ts";
import { CHAT_TRACK } from "../lib/chat-track.ts";

/** The affordance copy — the empty state of a gesture, so it names BOTH accepted classes (#376). */
const DROP_AFFORDANCE = "Drop images or video to attach";

export interface ComposerDropTargetProps {
  readonly dragActive: boolean;
  readonly dropTargetProps: ComposerMediaDrop["dropTargetProps"];
  readonly children: ReactNode;
}

export function ComposerDropTarget({ dragActive, dropTargetProps, children }: ComposerDropTargetProps): ReactElement {
  return (
    <Stack
      gap="field"
      data-slot="composer"
      {...dropTargetProps}
      data-drag-over={dragActive ? "" : undefined}
      // Reading-surface rule (D44 §12.1): the composer carries its OWN opaque backing (`bg-card`), never
      // leaning on the background scrim for legibility — the translucent `bg-input` tint left the typed
      // text unreadable over a bright background picture with scrim=0 (side-eye, 2026-07-18). The
      // interaction LIFT survives on the opaque `bg-muted` step + the border/ring/shadow focus cues.
      className={cn(
        CHAT_TRACK,
        "relative isolate rounded-card border border-border bg-card px-field py-field hover:border-input hover:bg-muted focus-within:border-input focus-within:bg-muted focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-(--radius-card) before:content-[''] focus-within:before:shadow-glow",
        // The DRAG-OVER paint reuses the focus lift, so an armed surface reads in the language the composer
        // already speaks instead of inventing a second one.
        "data-[drag-over]:border-primary data-[drag-over]:bg-muted data-[drag-over]:ring-2 data-[drag-over]:ring-ring",
      )}
    >
      {/* The drop AFFORDANCE — a designed state, not an afterthought: a drag over the composer is an empty
          state that has to name what will be taken (both media classes) or the highlight teaches nothing.
          Rendered in flow at the top of the card so it reads inside the surface it describes. */}
      {dragActive ? (
        <Row
          gap="field"
          align="center"
          justify="center"
          data-slot="composer-drop-affordance"
          className="rounded-base border border-primary border-dashed py-field"
        >
          <Icon icon={ImagePlus} size="sm" />
          <Text voice="gloss">{DROP_AFFORDANCE}</Text>
        </Row>
      ) : null}
      {children}
    </Stack>
  );
}
