// The persona CRUD mutations (mirrors settings/hooks/use-theme-mutations.ts) — the ONE mutation factory
// (`createEntityMutation`) instanced per verb, all bus-agnostic → cache invalidation (persona is not
// SSE-bus-covered, so `invalidates` is required, never `busDriven`). `list` refetches after every write
// so the panel reflows; `get` refetches after an update so an open editor rebaselines. star/rename are
// NOT separate verbs — they ride `persona.update` (a partial patch). TVars are the tRPC-INFERRED inputs
// (`inferInput`) so a branded-id the wire types as `unknown` never fights `exactOptionalPropertyTypes`.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type PersonaDetail = inferOutput<Trpc["persona"]["get"]>;

export const useCreatePersona = createEntityMutation<
  inferInput<Trpc["persona"]["create"]>,
  PersonaDetail
>({
  options: (trpc) => trpc.persona.create.mutationOptions(),
  invalidates: (trpc) => [trpc.persona.list.queryFilter()],
  errorToast: "Couldn't create the persona.",
});

export const useUpdatePersona = createEntityMutation<
  inferInput<Trpc["persona"]["update"]>,
  PersonaDetail
>({
  options: (trpc) => trpc.persona.update.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.persona.list.queryFilter(),
    trpc.persona.get.queryFilter({ personaId: vars.personaId }),
  ],
  errorToast: "Couldn't save the persona.",
});

export const useRemovePersona = createEntityMutation<
  inferInput<Trpc["persona"]["remove"]>,
  unknown
>({
  options: (trpc) => trpc.persona.remove.mutationOptions(),
  invalidates: (trpc) => [trpc.persona.list.queryFilter()],
  errorToast: "Couldn't delete the persona.",
});

export const useDuplicatePersona = createEntityMutation<
  inferInput<Trpc["persona"]["duplicate"]>,
  PersonaDetail
>({
  options: (trpc) => trpc.persona.duplicate.mutationOptions(),
  invalidates: (trpc) => [trpc.persona.list.queryFilter()],
  errorToast: "Couldn't duplicate the persona.",
});

// `persona.import` (restore-from-backup) moved to features/settings/surfaces/persona-settings-surface.tsx
// with the rest of "Persona settings" — this feature no longer has a consumer for it (one home per verb;
// re-add here only if the panel itself grows a restore affordance again).
