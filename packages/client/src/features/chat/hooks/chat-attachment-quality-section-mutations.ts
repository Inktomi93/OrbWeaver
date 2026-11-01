import type { SectionPatchVars } from "#data";
import { createEntityMutation } from "#data";

export const useUpdateQuality = createEntityMutation<SectionPatchVars<"chat">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save your attachment quality.",
});
