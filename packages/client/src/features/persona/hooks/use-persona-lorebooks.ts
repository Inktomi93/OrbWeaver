// Persona ↔ world-book (lorebook) link mutations. The attach/detach verbs live on the WORLD-INFO router
// (`trpc.worldInfo.*`, not the persona router) — an idempotent M:N junction.
//
// INVALIDATION (PD user-bus lane — busDriven): both verbs emit `worldInfoChanged`, and
// `USER_BUS_FILTERS.worldInfoChanged` path-invalidates the WHOLE `worldInfo` router (data/invalidation.ts)
// — which covers `listForPersona` (the connected-books section's read). That subscription is ALWAYS on
// (home-page.tsx), so the echo reconciles the acting device — a self-invalidate would double-refetch.
//   verb               user-bus event    client filters (USER_BUS_FILTERS.worldInfoChanged)
//   attachToPersona    worldInfoChanged  worldInfo.path (covers listForPersona)
//   detachFromPersona  worldInfoChanged  worldInfo.path (covers listForPersona)

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
