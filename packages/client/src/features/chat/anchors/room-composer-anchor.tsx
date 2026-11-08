// The room composer ANCHOR: the containment provider for the above-composer band and the composer. It keeps clear the
// inline room the thread's box gives up (the plugin column or the edge control's corner), so the rows and the
// composer centre on one axis, and the box is the container the composer track's flank glide measures against.

import { Stack } from "@orb/ui/layout";
import type { ComponentProps, ReactElement, ReactNode } from "react";

export interface RoomComposerAnchorProps {
  readonly reservation: ComponentProps<typeof Stack>["paddingInlineEnd"];
  readonly children: ReactNode;
}

/** Provide the container box the composer region's tracks consume. */
export function RoomComposerAnchor({ reservation, children }: RoomComposerAnchorProps): ReactElement {
  return (
    <Stack container={true} data-slot="chat-room-composer-region" gap="field" paddingInlineEnd={reservation}>
      {children}
    </Stack>
  );
}
