// Capture before FK nulling, then reseat exactly that set after persona's owner-gated deletion succeeds.

import type { CapturePersonaSeatsForDeleteOp } from "@orb/contracts/persona";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PersonaSeatCaptureDeps } from "../contract/persona-seats.ts";
import { loadPresentPersonaSeatChatIds } from "../persistence/persona-seats.ts";

/** Bind the post-delete reseating operation to the owner's captured present seats. */
export function createCapturePersonaSeatsForDelete(input: DbAssemblyInput<PersonaSeatCaptureDeps>): CapturePersonaSeatsForDeleteOp {
  const deps: PersonaSeatCaptureDeps = { ...input, db: databaseForOwner(input.db) };
  return async (ownerId, personaId) => {
    const chatIds = await loadPresentPersonaSeatChatIds(deps.db, ownerId, personaId);
    return async (reseatWith) => {
      for (const chatId of chatIds) {
        await deps.setActivePersona(chatId, ownerId, reseatWith);
      }
    };
  };
}
