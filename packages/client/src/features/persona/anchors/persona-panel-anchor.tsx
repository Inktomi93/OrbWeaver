// The persona panel ANCHOR — the containment provider for the Identity popover body (UI-Arch §4). The bar lens
// floats in a popup, so the box is capped at the medium container width inside it.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface PersonaPanelAnchorProps {
  readonly children: ReactNode;
}

/** Provide the container box the persona panel's sections consume. */
export function PersonaPanelAnchor({ children }: PersonaPanelAnchorProps): ReactElement {
  return <Container size="md">{children}</Container>;
}
