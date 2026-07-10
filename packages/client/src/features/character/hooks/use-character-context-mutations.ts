// The CONTEXT-panel immediate-commit mutations (FINAL-Character §7) — every write here fires on change /
// click, NEVER through the CONTENT save-bar (§2 — the commit-model seam). The ONE mutation factory
// (`createEntityMutation`) instanced per verb (the use-character-mutations.ts precedent). Trust flags ride
// the existing `useUpdateCharacter` (a `character.update` partial patch), so they are NOT re-declared here.
//
// busDriven vs invalidates (data/invalidation.ts doctrine): a verb whose server op emits a COVERING
// user-bus event is `busDriven` (the always-on `use-user-bus.ts` echo reconciles the acting + other
// devices — a self-invalidate would double-refetch). Verified emits:
//   • worldInfo.attach/detachToCharacter → `worldInfoChanged`   (covers worldInfo.* incl. listForCharacter)
//   • persona.connect/disconnect/createFromCharacter → `personasChanged` (covers persona.*)
//   • character.duplicate/remove/restore → `charactersChanged`  (covers character.* incl. listSnapshots)
//   • settings.updateUserSettingsSection → `settingsChanged`    (covers getUserSettings)
// The lone exception is `character.snapshot`: it emits NO user-bus event (the live card is unchanged —
// snapshot.ts header), so it KEEPS an explicit `invalidates` for its own `listSnapshots` read.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** §7 Relations — link a World Book to this character (role primary/auxiliary). `busDriven` (worldInfoChanged). */
export const useAttachBookToCharacter = createEntityMutation<
  inferInput<Trpc["worldInfo"]["attachToCharacter"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.attachToCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't link the world book.",
});

/** §7 Relations — unlink a World Book. `busDriven` (worldInfoChanged). */
export const useDetachBookFromCharacter = createEntityMutation<
  inferInput<Trpc["worldInfo"]["detachFromCharacter"]>,
  unknown
>({
  options: (trpc) => trpc.worldInfo.detachFromCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't unlink the world book.",
});

/** §7 Relations — connect a persona to this character. `busDriven` (personasChanged). */
export const useConnectPersonaToCharacter = createEntityMutation<
  inferInput<Trpc["persona"]["connectToCharacter"]>,
  unknown
>({
  options: (trpc) => trpc.persona.connectToCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't connect the persona.",
});

/** §7 Relations — disconnect a persona. `busDriven` (personasChanged). */
export const useDisconnectPersonaFromCharacter = createEntityMutation<
  inferInput<Trpc["persona"]["disconnectFromCharacter"]>,
  unknown
>({
  options: (trpc) => trpc.persona.disconnectFromCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't disconnect the persona.",
});

/** §7 Actions — Convert to persona (macros swapped `{{char}}`↔`{{user}}`). `busDriven` (personasChanged). */
export const useCreatePersonaFromCharacter = createEntityMutation<
  inferInput<Trpc["persona"]["createFromCharacter"]>,
  inferOutput<Trpc["persona"]["createFromCharacter"]>
>({
  options: (trpc) => trpc.persona.createFromCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't convert to a persona.",
});

/** §7 Actions — Duplicate this character. `busDriven` (charactersChanged); the caller selects the copy. */
export const useDuplicateCharacter = createEntityMutation<
  inferInput<Trpc["character"]["duplicate"]>,
  inferOutput<Trpc["character"]["duplicate"]>
>({
  options: (trpc) => trpc.character.duplicate.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't duplicate the character.",
});

/** §7 Actions — Delete this character (hard cascade). `busDriven` (charactersChanged); caller deselects. */
export const useRemoveCharacter = createEntityMutation<
  inferInput<Trpc["character"]["remove"]>,
  unknown
>({
  options: (trpc) => trpc.character.remove.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the character.",
});

/** §7 Actions — Set as welcome greeter (`seeds.welcomeAssistantCharacterId`). `busDriven` (settingsChanged). */
export const useSetWelcomeGreeter = createEntityMutation<
  inferInput<Trpc["settings"]["updateUserSettingsSection"]>,
  unknown
>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't set the welcome greeter.",
});

/** §7 History — Restore a snapshot (auto-snapshots current state first, so it's reversible). `busDriven`
 *  (charactersChanged covers character.* incl. get + listSnapshots). */
export const useRestoreCharacter = createEntityMutation<
  inferInput<Trpc["character"]["restore"]>,
  inferOutput<Trpc["character"]["restore"]>
>({
  options: (trpc) => trpc.character.restore.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't restore the snapshot.",
});

/** §7 History — Snapshot now. `busDriven` (the verb emits `charactersChanged` after its durable write —
 *  added 2026-07-09 stickler s3 F6 — which path-invalidates character.* incl. `listSnapshots`, and covers
 *  a second device's History tab). */
export const useSnapshotCharacter = createEntityMutation<
  inferInput<Trpc["character"]["snapshot"]>,
  inferOutput<Trpc["character"]["snapshot"]>
>({
  options: (trpc) => trpc.character.snapshot.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't take a snapshot.",
});
