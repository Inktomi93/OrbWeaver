// The extensions pane ANCHOR — the containment provider for the inset arms of the CONTENT pane (UI-Arch §4).
// The arms answer to the width left inside the pane's scroller and section inset, so the box sits inside
// them; `h-full` keeps a centred empty state centred against the pane's own height.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface ExtensionsPaneAnchorProps {
  readonly children: ReactNode;
}

/** Provide the container box the inset arms of the extensions pane consume. */
export function ExtensionsPaneAnchor({ children }: ExtensionsPaneAnchorProps): ReactElement {
  return <Container className="block-full">{children}</Container>;
}
