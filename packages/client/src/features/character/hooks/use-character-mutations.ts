// The character CRUD mutations used by the LIST (mirrors use-persona-mutations.ts) — the ONE mutation
// factory (`createEntityMutation`) instanced per verb. Every character verb emits `charactersChanged` on
// the user-bus, and `USER_BUS_FILTERS.charactersChanged` path-invalidates the whole `character` router
// (list + get); that subscription is ALWAYS on (home-page.tsx), so these are `busDriven` — the echo
// reconciles the acting device AND another device (a self-`invalidates` would double-refetch). The star
// chip + archive toggles are NOT separate verbs — they ride `character.update` (a partial patch: send only
// the changed key). Bulk verbs invalidate the same way. TVars are the tRPC-INFERRED inputs.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

type CharacterDetail = inferOutput<Trpc["character"]["update"]>;

/** §4.1 "New" — the minimal create (handle auto-derived from name). `busDriven` — `charactersChanged`
 *  refreshes `character.list`; the caller selects the returned character to open its editor. */
export const useCreateCharacter = createEntityMutation<inferInput<Trpc["character"]["create"]>, inferOutput<Trpc["character"]["create"]>>({
  options: (trpc) => trpc.character.create.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't create the character.",
});

/** Immediate-commit identity patch (§2/§4.4): the row's star chip fires `{ characterId, starred }`; the
 *  hero archive/trust/theme controls ride the same verb. `busDriven` — `charactersChanged` covers the list.
 *
 *  OPTIMISTIC (F16, §4.3 rule 7 — the frequent star/archive toggle flips instantly): patches the
 *  `character.get` detail cache (the hero editor's read) in `onMutate`, so a hero star/archive click paints
 *  before the server round-trip → bus echo → refetch. Deterministic key from `vars.characterId`; only the
 *  two flag fields are patched (a card save / theme / trust update through this same verb carries neither,
 *  so its `update` is a no-op and it degrades to the bus reconcile exactly as before — no regression).
 *  NB: the LIST row's star chip reads the SORT-discriminated `character.list` infinite query, whose exact
 *  key isn't derivable from these vars (the sort lives in the out-of-scope view-prefs store) — it still
 *  reconciles via the `charactersChanged` bus echo. */
export const useUpdateCharacter = createEntityMutation<inferInput<Trpc["character"]["update"]>, CharacterDetail, CharacterDetail>({
  options: (trpc) => trpc.character.update.mutationOptions(),
  optimistic: {
    readKey: (trpc, vars) => trpc.character.get.queryKey({ characterId: vars.characterId }),
    update: (old, vars) => {
      if (old === undefined) {
        return old;
      }
      const { starred, archived } = vars.input;
      if (starred === undefined && archived === undefined) {
        return old;
      }
      return {
        ...old,
        ...(starred === undefined ? {} : { starred }),
        ...(archived === undefined ? {} : { archived }),
      };
    },
  },
  busDriven: true,
  errorToast: "Couldn't save the character.",
});

/** §4.6 bulk: archive/unarchive many. `busDriven` — `charactersChanged` covers `character.list`. */
export const useBulkArchiveCharacters = createEntityMutation<inferInput<Trpc["character"]["bulkArchive"]>, unknown>({
  options: (trpc) => trpc.character.bulkArchive.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't archive the selected characters.",
});

/** §4.6 bulk: attach a tag to many. `busDriven` — `charactersChanged` covers `character.list`. */
export const useBulkAddCardTag = createEntityMutation<inferInput<Trpc["character"]["bulkAddCardTag"]>, unknown>({
  options: (trpc) => trpc.character.bulkAddCardTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't tag the selected characters.",
});

/** §6.2 tag chip remove: detach a tag by name from a character (the by-name mirror of `bulkAddCardTag`).
 *  `busDriven` — the verb emits `charactersChanged` (its OWN event family, unlike a generic tag detach which
 *  would leave the character chips stale), so the bus echo reconciles the acting + other devices; NOT an
 *  `invalidates` entry (the star-toggle precedent — a self-invalidate would double-refetch). */
export const useBulkRemoveCardTag = createEntityMutation<inferInput<Trpc["character"]["bulkRemoveCardTag"]>, unknown>({
  options: (trpc) => trpc.character.bulkRemoveCardTag.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't remove the tag.",
});

/** §4.6 bulk: delete many. `busDriven` — `charactersChanged` covers `character.list`. */
export const useBulkRemoveCharacters = createEntityMutation<inferInput<Trpc["character"]["bulkRemove"]>, unknown>({
  options: (trpc) => trpc.character.bulkRemove.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the selected characters.",
});
