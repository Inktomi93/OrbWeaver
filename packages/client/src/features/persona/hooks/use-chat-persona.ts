// Persona x chat write verbs backing persona-this-chat-section.tsx: the per-chat active-persona flip,
// the host anchor re-pin, and the reattribute escape hatch. All three emit a chat-bus event on the open
// chat that chatReads already covers, so all three are bus-driven, never a manual invalidates.

import type { ChatId, PersonaId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** `persona.setActivePersona` scoped to THIS chat — `targetUserId` omitted (the verb defaults to the
 *  caller; the panel never targets someone else's persona — that's a host roster control, not built here). */
export interface SetChatActivePersonaVars {
  readonly chatId: ChatId;
  readonly personaId: PersonaId | null;
}
export const useSetChatActivePersona = createEntityMutation<SetChatActivePersonaVars, unknown>({
  options: (trpc) => trpc.persona.setActivePersona.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch your persona for this chat.",
});

/** `chat.setChatAnchorPersona` — the host re-pin (FINAL-Persona §A.6b TASK 3). Host-gated server-side
 *  (`requireHost`); the client additionally hides the control when `!viewerIsHost`. */
export interface SetChatAnchorPersonaVars {
  readonly chatId: ChatId;
  readonly personaId: PersonaId | null;
}
export const useSetChatAnchorPersona = createEntityMutation<SetChatAnchorPersonaVars, unknown>({
  options: (trpc) => trpc.chat.setChatAnchorPersona.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't re-pin the anchor persona.",
});

/** `chat.reattributePersona` — restamp the caller's own past USER slots to a persona (the built escape hatch;
 *  author-or-host per-row server-side). Vars DERIVE from the wire (`scope` is the server-owned discriminated
 *  union — `{kind:"mine"}` is the bulk arm that retired this panel's 100-message client window, FINAL-Persona
 *  §A.7), so a scope change breaks here at compile time instead of drifting. */
export const useReattributePersona = createEntityMutation<inferInput<Trpc["chat"]["reattributePersona"]>, unknown>({
  options: (trpc) => trpc.chat.reattributePersona.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't restamp those messages.",
});
