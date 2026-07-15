// The New Chat modal as ONE co-located definition (client-architecture-lockdown.md §6d). `content`
// placement — triggered by chat content (the new-chat button), never the rail.

// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve the Plus glyph fine (the rail-slots precedent).
import { Plus } from "@orb/ui/icons";
import type { ModalDefinition } from "#state";
import { NewChatPicker } from "../surfaces/new-chat-picker-surface";

export const newChatModal: ModalDefinition = {
  id: "newChat",
  title: "New chat",
  trigger: { placement: "content", label: "New chat", icon: Plus },
  body: (): ReturnType<typeof NewChatPicker> => <NewChatPicker />,
};
