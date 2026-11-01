// Room persona writes also run from the global You surface while the room bus is detached.
// Settlement reconciles the same reads as personaSwitched; restamping lives in #data's useReattributePersona.

import type { ChatId } from "@orb/kit/ids";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation, personaWriteReads } from "#data";

// The router input types a TypeId as a plain string; the invalidation below needs the branded ChatId.
interface ChatScoped {
  readonly chatId: ChatId;
}

/** `persona.setActivePersona` scoped to THIS chat — `targetUserId` omitted (the verb defaults to the
 *  caller; the panel never targets someone else's persona — that's a host list control, not built here). */
export const useSetChatActivePersona = createEntityMutation<Omit<inferInput<Trpc["persona"]["setActivePersona"]>, "targetUserId"> & ChatScoped, unknown>({
  options: (trpc) => trpc.persona.setActivePersona.mutationOptions(),
  invalidates: (trpc, { chatId }) => personaWriteReads(trpc, chatId),
  errorToast: "Couldn't switch your persona for this chat.",
});

/** `chat.setChatAnchorPersona` — the host re-pin (FINAL-Persona §A.6b TASK 3). Host-gated server-side
 *  (`requireHost`); the client additionally hides the control when `!viewerIsHost`. */
export const useSetChatAnchorPersona = createEntityMutation<inferInput<Trpc["chat"]["setChatAnchorPersona"]> & ChatScoped, unknown>({
  options: (trpc) => trpc.chat.setChatAnchorPersona.mutationOptions(),
  invalidates: (trpc, { chatId }) => personaWriteReads(trpc, chatId),
  errorToast: "Couldn't re-pin the anchor persona.",
});
