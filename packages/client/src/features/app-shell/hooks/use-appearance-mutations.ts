import type { BackgroundLibraryEntry } from "@orb/contracts/settings";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { SectionPatchVars, Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useUpdateBackground = createEntityMutation<SectionPatchVars<"appearance">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your background settings.",
});

export const useUpdateEffects = createEntityMutation<SectionPatchVars<"appearance">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your effect settings.",
});

export const useUpdateReading = createEntityMutation<SectionPatchVars<"appearance">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your reading settings.",
});

export const useUpdateSizing = createEntityMutation<SectionPatchVars<"appearance">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your sizing settings.",
});

/** The verb WRITES no settings — it only materializes the asset and hands the entry back; the library row
 *  lands through the appearance autosave patch, which owns that reconciliation. So nothing to invalidate. */
export const useAddExternalBackground = createEntityMutation<inferInput<Trpc["settings"]["addExternalBackground"]>, BackgroundLibraryEntry>({
  options: (trpc) => trpc.settings.addExternalBackground.mutationOptions(),
  invalidates: () => [],
});
