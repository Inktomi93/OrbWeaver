import type { SectionPatchVars } from "#data";
import { createEntityMutation } from "#data";

export const useSetPersonaPrefs = createEntityMutation<SectionPatchVars<"persona">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save your persona settings.",
});
