// Persona GLOBAL identity write — all SERVER state (never Zustand): the `UserSettings` seed pointers
// (`currentPersonaId` #2 / `defaultPersonaId` #1) are patched through the section-patch verb (the same
// live-flip seam the appearance/theme panes use), and read back through `getUserSettings`.
// `invalidates: getUserSettings` refetches so every reader (the switcher chip, the row's Default badge)
// re-renders live. The sibling `persona` prefs section (`showNotifications`) moved to
// features/settings/surfaces/persona-settings-surface.tsx with the rest of "Persona settings" — this
// feature no longer reads/writes it.

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
