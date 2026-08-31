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

// #866 S4 — the roster band's "From character" door (a persona is often the mirror of a card you already
// wrote). The character feature holds its own thin wrappers over the same wire verbs for the card-side
// doors (`useCreatePersonaFromCharacter` etc.) — distinct names here on purpose, so a symbol search never
// conflates the two call sites; each caller owns its toast copy, the server owns the mint.
export const usePersonaFromCharacter = createEntityMutation<inferInput<Trpc["persona"]["createFromCharacter"]>, PersonaDetail>({
  options: (trpc) => trpc.persona.createFromCharacter.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't create the persona from that character.",
});

// #866 S4 — the editor's "Connected characters" section (the junction from the persona side; the
// character editor's relations tab drives the same junction from the other end).
export const useConnectCharacter = createEntityMutation<inferInput<Trpc["persona"]["connectToCharacter"]>, unknown>({
  options: (trpc) => trpc.persona.connectToCharacter.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't connect the character.",
});

export const useDisconnectCharacter = createEntityMutation<inferInput<Trpc["persona"]["disconnectFromCharacter"]>, unknown>({
  options: (trpc) => trpc.persona.disconnectFromCharacter.mutationOptions(),
  busDriven: true, // emits `personasChanged` → USER_BUS_FILTERS covers persona.path (list + get).
  errorToast: "Couldn't disconnect the character.",
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
