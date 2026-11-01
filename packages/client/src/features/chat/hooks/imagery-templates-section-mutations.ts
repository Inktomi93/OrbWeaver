import type { SectionPatchVars } from "#data";
import { createEntityMutation } from "#data";

export const useUpdateImagery = createEntityMutation<SectionPatchVars<"imagery">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your image-prompt templates.",
});
