// The new-chat picker ANCHOR — the containment provider for the modal body (UI-Arch §4). The picker's footer
// labels step down by the width of the dialog it is dropped into, so the box is declared where the modal
// definition mounts the surface.

import { Container } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface NewChatPickerAnchorProps {
  readonly children: ReactNode;
}

/** Provide the container box the new-chat picker consumes. */
export function NewChatPickerAnchor({ children }: NewChatPickerAnchorProps): ReactElement {
  return <Container>{children}</Container>;
}
