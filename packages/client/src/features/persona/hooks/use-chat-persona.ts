// Room persona writes also run from the global You surface while the room bus is detached.
// Settlement reconciles the same reads as personaSwitched; restamping lives in #data's useReattributePersona.

import type { ChatId, PersonaId } from "@orb/kit/ids";
import { createEntityMutation, personaWriteReads } from "#data";

/** `persona.setActivePersona` scoped to THIS chat — `targetUserId` omitted (the verb defaults to the
 *  caller; the panel never targets someone else's persona — that's a host list control, not built here). */
export interface SetChatActivePersonaVars {
  readonly chatId: ChatId;
  readonly personaId: PersonaId | null;
}
export const useSetChatActivePersona = createEntityMutation<SetChatActivePersonaVars, unknown>({
  options: (trpc) => trpc.persona.setActivePersona.mutationOptions(),
  invalidates: (trpc, { chatId }) => personaWriteReads(trpc, chatId),
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
  invalidates: (trpc, { chatId }) => personaWriteReads(trpc, chatId),
  errorToast: "Couldn't re-pin the anchor persona.",
});
