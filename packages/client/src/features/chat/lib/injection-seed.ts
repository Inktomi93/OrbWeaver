// The ONE new-injection seed — an empty row at the shared Add placement (`NEW_CHAT_INJECTION_PLACEMENT`, which a
// saved Rewrite correction lands at too), so the default row can't drift between the list and the server.
import type { ChatInjectionInput } from "@orb/contracts/chat";
import { NEW_CHAT_INJECTION_PLACEMENT } from "@orb/contracts/chat";

export const NEW_INJECTION: ChatInjectionInput = {
  ...NEW_CHAT_INJECTION_PLACEMENT,
  content: "",
};
