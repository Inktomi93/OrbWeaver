// The composer CARD — the compact message-first surface, which is also the media DROP TARGET (#376). Extracted
// from composer.tsx when the drop gesture pushed that file past the component-size cap; the card's paint and
// the drag affordance are one concern (a surface that says what it will accept), so they moved together.
//
// The drop target is the whole card a user aims at, not a separate box. It claims only FILE drags (the
// discrimination lives in `use-composer-media-drop`), which is also what carves it out of the app-shell's
// stray-drop guard: that guard skips an event these handlers have already defaultPrevented, so nothing
// outside the composer loses its navigate-away protection.

import { Card } from "@orb/ui/card";
import { Icon, ImagePlus } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { ComposerMediaDrop } from "../hooks/use-composer-media-drop.ts";
import { Track } from "../lib/chat-track.tsx";

/** The affordance copy — the empty state of a gesture, so it names BOTH accepted classes (#376). */
const DROP_AFFORDANCE = "Drop images or video to attach";

export interface ComposerDropTargetProps {
  readonly dragActive: boolean;
  readonly dropTargetProps: ComposerMediaDrop["dropTargetProps"];
  readonly children: ReactNode;
}

export function ComposerDropTarget({ dragActive, dropTargetProps, children }: ComposerDropTargetProps): ReactElement {
  return (
    <Track
      of={Card}
      track="composer"
      className="relative isolate"
      ownSlot="composer"
      {...dropTargetProps}
      data-drag-over={dragActive ? "" : undefined}
      // Reading-surface rule (D44 §12.1): the composer carries its OWN opaque card backing, never leaning on the
      // background scrim for legibility. The interaction lift rides the opaque muted step, and the armed drop
      // state is louder than focus: an armed target has to announce itself while a file hovers over it.
      dropTarget={true}
      holdsField={true}
      shadow="none"
      shape="float"
    >
      <Stack className="min-inline-0" data-slot="composer-content" gap="field">
        {/* The drop AFFORDANCE — a designed state, not an afterthought: a drag over the composer is an empty
          state that has to name what will be taken (both media classes) or the highlight teaches nothing.
          Rendered in flow at the top of the card so it reads inside the surface it describes. */}
        {dragActive ? (
          <Card outline="dashed" ownSlot="composer-drop-affordance" padding="none" shadow="none" tone="primaryOutline">
            <Row gap="field" align="center" justify="center" className="py-field">
              <Icon icon={ImagePlus} size="sm" />
              <Text voice="gloss">{DROP_AFFORDANCE}</Text>
            </Row>
          </Card>
        ) : null}
        {children}
      </Stack>
    </Track>
  );
}
