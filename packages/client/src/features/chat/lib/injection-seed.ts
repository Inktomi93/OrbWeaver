// The ONE new-injection seed — a fresh in-chat system injection at depth 0 with empty content. Shared by
// the committed injections manager (`addInjection.mutate({ chatId, ...NEW_INJECTION })`) and the draft
// context tab (appended to the draft array), so the default row can't drift (derive-modernization §W5).
import type { ChatInjectionInput } from "@orb/contracts/chat";

export const NEW_INJECTION: ChatInjectionInput = {
  position: "in_chat",
  depth: 0,
  role: "system",
  content: "",
};
