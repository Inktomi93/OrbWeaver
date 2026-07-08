// Persona × CHAT write verbs (FINAL-Persona §A.6 "This chat" section — the per-chat picker folded into
// the ONE rail-foot panel, not a separate features/chat picker). Backs `persona-this-chat-section.tsx`:
// the per-chat active-persona flip (`persona.setActivePersona`, `targetUserId` OMITTED — self), the
// host anchor re-pin (`chat.setChatAnchorPersona`), and the reattribute escape hatch
// (`chat.reattributePersona`).
//
// All three server verbs emit a chat-bus event on the OPEN chat that `chatReads` (data/invalidation.ts)
// already covers — `personaSwitched` / `chatUpdated` / `messageEdited` respectively — so all three are
// BUS-DRIVEN (the `use-roster-mutations.ts` precedent), never a manual `invalidates`: the mutation-vs-bus
// rule forbids both (double-refetches the same keys, the observed send storm).

import type { ChatId, MessageId, PersonaId } from "@orb/kit/ids";
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

/** `chat.reattributePersona` — restamp a set of the caller's own past USER slots to a persona (the built
 *  escape hatch; author-or-host per-row server-side). The CALLER assembles `messageIds` — see the
 *  section's `REATTRIBUTE_WINDOW` scoping note (no server "restamp everything" bulk resolver exists). */
export interface ReattributePersonaVars {
  readonly chatId: ChatId;
  // Mutable (not readonly) — must structurally match the wire's zod-inferred `MessageId[]` input.
  readonly messageIds: MessageId[];
  readonly personaId: PersonaId;
}
export const useReattributePersona = createEntityMutation<ReattributePersonaVars, unknown>({
  options: (trpc) => trpc.chat.reattributePersona.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't restamp those messages.",
});
