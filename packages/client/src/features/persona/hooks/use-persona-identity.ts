// Persona global identity write — all server state (never Zustand): the seed pointers
// (currentPersonaId/defaultPersonaId) patch through the section-patch verb and read back via
// getUserSettings. updateUserSettingsSection emits settingsChanged unconditionally, always-on covered
// by the user-bus subscription, so this is busDriven.

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
