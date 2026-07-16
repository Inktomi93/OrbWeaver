// The CONTEXT-panel immediate-commit mutations — every write here fires on change/click, never through
// the CONTENT save-bar. `busDriven: true` means the server op emits a covering user-bus event (the
// always-on echo reconciles the acting + other devices, so a self-invalidate would double-refetch).
// `character.snapshot` is the lone exception — it emits no bus event, so it keeps an explicit invalidate.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Link a World Book to this character (role primary/auxiliary). `busDriven` (worldInfoChanged). */
export const useAttachBookToCharacter = createEntityMutation<inferInput<Trpc["worldInfo"]["attachToCharacter"]>, unknown>({
  options: (trpc) => trpc.worldInfo.attachToCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't link the world book.",
});

/** Unlink a World Book. `busDriven` (worldInfoChanged). */
export const useDetachBookFromCharacter = createEntityMutation<inferInput<Trpc["worldInfo"]["detachFromCharacter"]>, unknown>({
  options: (trpc) => trpc.worldInfo.detachFromCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't unlink the world book.",
});

/** Connect a persona to this character. `busDriven` (personasChanged). */
export const useConnectPersonaToCharacter = createEntityMutation<inferInput<Trpc["persona"]["connectToCharacter"]>, unknown>({
  options: (trpc) => trpc.persona.connectToCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't connect the persona.",
});

/** Disconnect a persona. `busDriven` (personasChanged). */
export const useDisconnectPersonaFromCharacter = createEntityMutation<inferInput<Trpc["persona"]["disconnectFromCharacter"]>, unknown>({
  options: (trpc) => trpc.persona.disconnectFromCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't disconnect the persona.",
});

/** Convert to persona (macros swapped `{{char}}`↔`{{user}}`). `busDriven` (personasChanged). */
export const useCreatePersonaFromCharacter = createEntityMutation<
  inferInput<Trpc["persona"]["createFromCharacter"]>,
  inferOutput<Trpc["persona"]["createFromCharacter"]>
>({
  options: (trpc) => trpc.persona.createFromCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't convert to a persona.",
});

/** Duplicate this character. `busDriven` (charactersChanged); the caller selects the copy. */
export const useDuplicateCharacter = createEntityMutation<inferInput<Trpc["character"]["duplicate"]>, inferOutput<Trpc["character"]["duplicate"]>>({
  options: (trpc) => trpc.character.duplicate.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't duplicate the character.",
});

/** Delete this character (hard cascade). `busDriven` (charactersChanged); caller deselects. */
export const useRemoveCharacter = createEntityMutation<inferInput<Trpc["character"]["remove"]>, unknown>({
  options: (trpc) => trpc.character.remove.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete the character.",
});

/** Set as welcome greeter (`seeds.welcomeAssistantCharacterId`). `busDriven` (settingsChanged). */
export const useSetWelcomeGreeter = createEntityMutation<inferInput<Trpc["settings"]["updateUserSettingsSection"]>, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't set the welcome greeter.",
});

/** Restore a snapshot (auto-snapshots current state first, so it's reversible). `busDriven` (charactersChanged). */
export const useRestoreCharacter = createEntityMutation<inferInput<Trpc["character"]["restore"]>, inferOutput<Trpc["character"]["restore"]>>({
  options: (trpc) => trpc.character.restore.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't restore the snapshot.",
});

/** Snapshot now. `busDriven` (charactersChanged path-invalidates `listSnapshots`, covers other devices' History tab). */
export const useSnapshotCharacter = createEntityMutation<inferInput<Trpc["character"]["snapshot"]>, inferOutput<Trpc["character"]["snapshot"]>>({
  options: (trpc) => trpc.character.snapshot.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't take a snapshot.",
});
