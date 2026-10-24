// The New Chat modal as ONE co-located definition (client-architecture-lockdown.md §6d). `content`
// placement — triggered by chat content (the new-chat button), never the rail.

import { Plus } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ModalDefinition } from "#state";
import { clearNewChatIntent } from "#state";
import { NewChatPickerAnchor } from "../anchors/new-chat-picker-anchor.tsx";
import { NewChatPicker } from "../surfaces/new-chat-picker-surface.tsx";

export const newChatModal: ModalDefinition = {
  id: "newChat",
  title: "New chat",
  trigger: { placement: "surface", label: "New chat", icon: Plus },
  onClose: clearNewChatIntent,
  body: (): ReactElement => (
    <NewChatPickerAnchor>
      <NewChatPicker />
    </NewChatPickerAnchor>
  ),
};
