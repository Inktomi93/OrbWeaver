// The persona CRUD mutations (mirrors settings/hooks/use-theme-mutations.ts) — the ONE mutation factory
// (`createEntityMutation`) instanced per verb. PD user-bus lane: every persona verb emits `personasChanged`,
// and `USER_BUS_FILTERS.personasChanged` path-invalidates the whole `persona` router (list + get). That
// user-bus subscription is ALWAYS on (home-page.tsx), so all four are `busDriven` — the echo reconciles the
// acting device AND device B (a self-`invalidates` would double-refetch the same keys). star/rename are NOT
// separate verbs — they ride `persona.update` (a partial patch). TVars are the tRPC-INFERRED inputs.
//   verb        user-bus event    client filters (USER_BUS_FILTERS.personasChanged)
//   create      personasChanged   persona.path (list + get)
//   update      personasChanged   persona.path (list + get)
//   remove      personasChanged   persona.path (list + get)
//   duplicate   personasChanged   persona.path (list + get)

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type PersonaDetail = inferOutput<Trpc["persona"]["get"]>;

export const useCreatePersona = createEntityMutation<
  inferInput<Trpc["persona"]["create"]>,
  PersonaDetail
>({
  options: (trpc) => trpc.persona.create.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't create the persona.",
});

export const useUpdatePersona = createEntityMutation<
  inferInput<Trpc["persona"]["update"]>,
  PersonaDetail
>({
  options: (trpc) => trpc.persona.update.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't save the persona.",
});

export const useRemovePersona = createEntityMutation<
  inferInput<Trpc["persona"]["remove"]>,
  unknown
>({
  options: (trpc) => trpc.persona.remove.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't delete the persona.",
});

export const useDuplicatePersona = createEntityMutation<
  inferInput<Trpc["persona"]["duplicate"]>,
  PersonaDetail
>({
  options: (trpc) => trpc.persona.duplicate.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't duplicate the persona.",
});

// `persona.import` (restore-from-backup) moved to features/settings/surfaces/persona-settings-surface.tsx
// with the rest of "Persona settings" — this feature no longer has a consumer for it (one home per verb;
// re-add here only if the panel itself grows a restore affordance again).
