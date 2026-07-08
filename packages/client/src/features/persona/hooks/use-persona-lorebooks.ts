// Persona ↔ world-book (lorebook) link mutations. The attach/detach verbs live on the WORLD-INFO router
// (`trpc.worldInfo.*`, not the persona router) — an idempotent M:N junction. Invalidates the per-persona
// book list so the connected-books section reflows on toggle.

import type { PersonaId, WorldBookId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

export interface PersonaBookVars {
  readonly personaId: PersonaId;
  readonly bookId: WorldBookId;
}

export const useAttachBookToPersona = createEntityMutation<PersonaBookVars, unknown>({
  options: (trpc) => trpc.worldInfo.attachToPersona.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.worldInfo.listForPersona.queryFilter({ personaId: vars.personaId }),
  ],
  errorToast: "Couldn't attach the world book.",
});

export const useDetachBookFromPersona = createEntityMutation<PersonaBookVars, unknown>({
  options: (trpc) => trpc.worldInfo.detachFromPersona.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.worldInfo.listForPersona.queryFilter({ personaId: vars.personaId }),
  ],
  errorToast: "Couldn't detach the world book.",
});
