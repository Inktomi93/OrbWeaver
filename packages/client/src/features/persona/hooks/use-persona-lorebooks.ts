// Persona <-> world-book (lorebook) link mutations. The attach/detach verbs live on the world-info
// router (an idempotent M:N junction). Both emit worldInfoChanged, covered by the always-on user-bus
// subscription, so both are busDriven.

import type { PersonaId, WorldBookId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

export interface PersonaBookVars {
  readonly personaId: PersonaId;
  readonly bookId: WorldBookId;
}

export const useAttachBookToPersona = createEntityMutation<PersonaBookVars, unknown>({
  options: (trpc) => trpc.worldInfo.attachToPersona.mutationOptions(),
  busDriven: true, // emits `worldInfoChanged` → USER_BUS_FILTERS covers worldInfo.path (listForPersona).
  errorToast: "Couldn't attach the world book.",
});

export const useDetachBookFromPersona = createEntityMutation<PersonaBookVars, unknown>({
  options: (trpc) => trpc.worldInfo.detachFromPersona.mutationOptions(),
  busDriven: true, // emits `worldInfoChanged` → USER_BUS_FILTERS covers worldInfo.path (listForPersona).
  errorToast: "Couldn't detach the world book.",
});
