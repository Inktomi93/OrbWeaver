// The New Chat modal as ONE co-located definition (client-architecture-lockdown.md §6d). `content`
// placement — triggered by chat content (the new-chat button), never the rail.

import { Plus } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { NEW_CHAT_DIALOG_TITLE } from "#lib";
import type { ModalDefinition } from "#state";
import { clearNewChatIntent } from "#state";
import { NewChatPickerAnchor } from "../anchors/new-chat-picker-anchor.tsx";
import { NewChatPicker } from "../surfaces/new-chat-picker-surface.tsx";

export const newChatModal: ModalDefinition = {
  id: "newChat",
  title: NEW_CHAT_DIALOG_TITLE,
  trigger: { placement: "surface", label: NEW_CHAT_DIALOG_TITLE, icon: Plus },
  onClose: clearNewChatIntent,
  body: (): ReactElement => (
    <NewChatPickerAnchor>
      <NewChatPicker />
    </NewChatPickerAnchor>
  ),
};
