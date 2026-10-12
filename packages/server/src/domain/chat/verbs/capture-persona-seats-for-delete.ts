// Capture before FK nulling, then reseat exactly that set after persona's owner-gated deletion succeeds.

import type { CapturePersonaSeatsForDelete, PersonaSeatCaptureDeps } from "../contract/persona-seats.ts";
import { loadPresentPersonaSeatChatIds } from "../persistence/persona-seats.ts";

/** Bind the post-delete reseating operation to the owner's captured present seats. */
export function createCapturePersonaSeatsForDelete(deps: PersonaSeatCaptureDeps): CapturePersonaSeatsForDelete {
  return async (ownerId, personaId) => {
    const chatIds = await loadPresentPersonaSeatChatIds(deps.db, ownerId, personaId);
    return async (reseatWith) => {
      for (const chatId of chatIds) {
        await deps.setActivePersona(chatId, ownerId, reseatWith);
      }
    };
  };
}
