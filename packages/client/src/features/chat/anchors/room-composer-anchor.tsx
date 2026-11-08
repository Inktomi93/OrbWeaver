// The room composer ANCHOR: the containment provider for the above-composer band and the composer. It keeps clear the
// inline room the thread's box gives up (the plugin column or the edge control's corner), so the rows and the
// composer centre on one axis, and the box is the container the composer track's flank glide measures against.

import { Stack } from "@orb/ui/layout";
import type { ComponentProps, ReactElement, ReactNode, Ref } from "react";

export interface RoomComposerAnchorProps {
  readonly reservation: ComponentProps<typeof Stack>["paddingInlineEnd"];
  /** The anchor's box, for the measured reservation a content-sized flank column asks of it. */
  readonly regionRef: Ref<HTMLDivElement>;
  readonly children: ReactNode;
}

/** Provide the container box the composer region's tracks consume. */
export function RoomComposerAnchor({ reservation, regionRef, children }: RoomComposerAnchorProps): ReactElement {
  return (
    <Stack container={true} data-slot="chat-room-composer-region" gap="field" paddingInlineEnd={reservation} ref={regionRef}>
      {children}
    </Stack>
  );
}
