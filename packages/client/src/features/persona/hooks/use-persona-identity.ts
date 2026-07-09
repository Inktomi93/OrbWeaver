// Persona GLOBAL identity write — all SERVER state (never Zustand): the `UserSettings` seed pointers
// (`currentPersonaId` #2 / `defaultPersonaId` #1) are patched through the section-patch verb (the same
// live-flip seam the appearance/theme panes use), and read back through `getUserSettings`. The sibling
// `persona` prefs section (`showNotifications`) moved to features/settings/surfaces/persona-settings-
// surface.tsx with the rest of "Persona settings" — this feature no longer reads/writes it.
//
// INVALIDATION (PD user-bus lane — busDriven): `updateUserSettingsSection` emits `settingsChanged`
// UNCONDITIONALLY (every section, including `seeds`), and `USER_BUS_FILTERS.settingsChanged` covers
// `getUserSettings` (data/invalidation.ts). That subscription is ALWAYS on (home-page.tsx), so the echo
// reconciles the acting device (a self-invalidate would double-refetch the same key) — `busDriven`.
//   verb                        user-bus event    client filters
//   updateUserSettingsSection   settingsChanged   getUserSettings.path

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
  busDriven: true, // emits `settingsChanged` → USER_BUS_FILTERS covers getUserSettings.
  errorToast: "Couldn't update your persona.",
});
