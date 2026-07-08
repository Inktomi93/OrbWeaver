// Persona GLOBAL identity + prefs writes — all SERVER state (never Zustand): the `UserSettings` seed
// pointers (`currentPersonaId` #2 / `defaultPersonaId` #1) and the persona UX prefs (`showNotifications`)
// are patched through the section-patch verb (the same live-flip seam the appearance/theme panes use),
// and read back through `getUserSettings`. `invalidates: getUserSettings` refetches so every reader
// (the switcher chip, the editor crown, the settings footer) re-renders live.

import { createEntityMutation } from "#data";

/** Patch the `seeds` section — sets Current (#2) and/or Default (#1) persona. A settings write; changing
 *  a global pointer NEVER mutates an open chat (the chat froze its own pointers at open, §A.3). */
export interface PersonaSeedPatchVars {
  readonly section: "seeds";
  readonly patch: {
    readonly currentPersonaId?: string | null;
    readonly defaultPersonaId?: string | null;
  };
}
export const useSetPersonaSeed = createEntityMutation<PersonaSeedPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getUserSettings.queryFilter()],
  errorToast: "Couldn't update your persona.",
});

/** Patch the `persona` prefs section (ST `persona_show_notifications` parity). */
export interface PersonaPrefsPatchVars {
  readonly section: "persona";
  readonly patch: { readonly showNotifications: boolean };
}
export const useSetPersonaPrefs = createEntityMutation<PersonaPrefsPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getUserSettings.queryFilter()],
  errorToast: "Couldn't save your persona settings.",
});
