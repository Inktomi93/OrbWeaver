// The home pane ANCHOR — the containment provider for the tile grid (UI-Arch §4). The grid answers to the
// width left inside the scroller's section inset, so the box sits inside that inset rather than around it.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface HomePaneAnchorProps {
  readonly children: ReactNode;
}

/** Provide the container box the home grid consumes. */
export function HomePaneAnchor({ children }: HomePaneAnchorProps): ReactElement {
  return <Container className="inline-full">{children}</Container>;
}
