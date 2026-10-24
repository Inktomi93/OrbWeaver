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
  return <Container className="relative min-h-0 flex-1">{children}</Container>;
}
