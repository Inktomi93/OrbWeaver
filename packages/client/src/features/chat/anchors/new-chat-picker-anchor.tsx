// The new-chat picker ANCHOR — the containment provider for the modal body (UI-Arch §4). The picker's footer
// labels step down by the width of the dialog it is dropped into, so the box is declared where the modal
// definition mounts the surface. It is a column that shares the dialog body's room, so a short dialog's list gets what its chrome leaves.

import { Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";

export interface NewChatPickerAnchorProps {
  readonly children: ReactNode;
}

/** Provide the container box the new-chat picker consumes. */
export function NewChatPickerAnchor({ children }: NewChatPickerAnchorProps): ReactElement {
  return (
    <Stack container={true} grow="content" minHeight="shrinks">
      {children}
    </Stack>
  );
}
