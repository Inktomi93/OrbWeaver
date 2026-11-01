// The Versions tab's two writes on the CHARACTER's snapshot log. They are character verbs, and a feature may
// not import another feature's hooks, so the refinery spells its own over the same procedures. Both keep an
// explicit `invalidates` for the snapshot list (writer-local); the card half of a restore rides character's bus.

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Mint a snapshot by hand — the Versions empty state's next action. */
export const useSnapshotCharacterNow = createEntityMutation<inferInput<Trpc["character"]["snapshot"]>, unknown>({
  options: (trpc) => trpc.character.snapshot.mutationOptions(),
  invalidates: (trpc) => [trpc.character.listSnapshots.pathFilter()],
  errorToast: "Couldn't snapshot the card.",
});

/** Restore snapshots the live card first (reversible by construction) and its `character.update` emits
 *  `charactersChanged`, so only the snapshot list needs the writer-local row (it gains the pre-restore row). */
export const useRestoreCharacterSnapshot = createEntityMutation<inferInput<Trpc["character"]["restore"]>, unknown>({
  options: (trpc) => trpc.character.restore.mutationOptions(),
  invalidates: (trpc) => [trpc.character.listSnapshots.pathFilter()],
  errorToast: "Couldn't restore that version.",
});
