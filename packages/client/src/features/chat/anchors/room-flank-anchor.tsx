// The room flank ANCHOR — the containment provider for the thread-and-flank row (UI-Arch §4). The row stacks
// or sits side by side by the width left inside the room's side inset, so the box sits inside that inset.
// It is also the positioned, flexing box the flank edge control is placed against.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface RoomFlankAnchorProps {
  readonly children: ReactNode;
}

/** Provide the container box the thread-and-flank row consumes. */
export function RoomFlankAnchor({ children }: RoomFlankAnchorProps): ReactElement {
  // The fit probe's sentinel is wider than the room at enlarged text; the clip keeps it from scrolling the room sideways.
  return (
    <Container className="relative overflow-x-clip min-block-0" grow={true}>
      {children}
    </Container>
  );
}
