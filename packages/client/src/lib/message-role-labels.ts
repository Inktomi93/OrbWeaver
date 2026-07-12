// The ONE `MessageRole` display-label map — was re-spelled 4× across chat/persona/character (the
// injections-manager, room-overrides-form, persona-editor, character-advanced-tab role selects all
// showed System/User/Assistant for the same `@orb/kit/message-role` tuple). Features can't import each
// other; `lib/` sits below every feature, so this is the shared home.

import type { MessageRole } from "@orb/kit/message-role";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import type { SelectItems } from "@orb/ui/select";

export const MESSAGE_ROLE_LABELS: Record<MessageRole, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
};

export const MESSAGE_ROLE_ITEMS: SelectItems<string> = MESSAGE_ROLES.map((value) => ({
  value,
  label: MESSAGE_ROLE_LABELS[value],
}));
