// The persona CRUD mutations — one createEntityMutation instance per verb. Every verb emits
// personasChanged, invalidated by the always-on user-bus subscription, so all four are busDriven (a
// self-invalidates would double-refetch). star/rename ride persona.update (a partial patch), not
// separate verbs.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type PersonaDetail = inferOutput<Trpc["persona"]["get"]>;

export const useCreatePersona = createEntityMutation<inferInput<Trpc["persona"]["create"]>, PersonaDetail>({
  options: (trpc) => trpc.persona.create.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't create the persona.",
});

export const useUpdatePersona = createEntityMutation<inferInput<Trpc["persona"]["update"]>, PersonaDetail>({
  options: (trpc) => trpc.persona.update.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't save the persona.",
});

export const useRemovePersona = createEntityMutation<inferInput<Trpc["persona"]["remove"]>, unknown>({
  options: (trpc) => trpc.persona.remove.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't delete the persona.",
});

export const useDuplicatePersona = createEntityMutation<inferInput<Trpc["persona"]["duplicate"]>, PersonaDetail>({
  options: (trpc) => trpc.persona.duplicate.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't duplicate the persona.",
});

// F3 — the ruled lifecycle anatomy (band=Import, kebab=Export, editors carry zero lifecycle chrome).
// Import used to live in a SETTINGS surface and Export inside the persona EDITOR: four families, three
// placements. Both doors now live where the anatomy puts them, over the FILE-shaped tRPC procs (the same
// bytes the bundle carries).
export const useImportPersonaFile = createEntityMutation<inferInput<Trpc["persona"]["import"]>, PersonaDetail>({
  options: (trpc) => trpc.persona.import.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  // The server's REFUSAL REASON is rendered by the caller (it needs the words); this is the last-resort copy.
  errorToast: "Couldn't restore the persona.",
});
