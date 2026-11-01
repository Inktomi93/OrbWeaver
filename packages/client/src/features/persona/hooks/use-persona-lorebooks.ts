// Persona <-> world-book (lorebook) link mutations. The attach/detach verbs live on the world-info
// router (an idempotent M:N junction). Both emit worldInfoChanged, covered by the always-on user-bus
// subscription, so both are busDriven.

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useAttachBookToPersona = createEntityMutation<inferInput<Trpc["worldInfo"]["attachToPersona"]>, unknown>({
  options: (trpc) => trpc.worldInfo.attachToPersona.mutationOptions(),
  busDriven: true, // emits `worldInfoChanged` → USER_BUS_FILTERS covers worldInfo.path (listForPersona).
  errorToast: "Couldn't attach the world book.",
});

export const useDetachBookFromPersona = createEntityMutation<inferInput<Trpc["worldInfo"]["detachFromPersona"]>, unknown>({
  options: (trpc) => trpc.worldInfo.detachFromPersona.mutationOptions(),
  busDriven: true, // emits `worldInfoChanged` → USER_BUS_FILTERS covers worldInfo.path (listForPersona).
  errorToast: "Couldn't detach the world book.",
});
