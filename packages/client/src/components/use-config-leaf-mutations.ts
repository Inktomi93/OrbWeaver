import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";
import { SETTING_RESET_FAILED_TOAST } from "./shared-control-names.ts";

export const useResetLeaf = createEntityMutation<inferInput<Trpc["settings"]["updateUserSettingsSection"]>, unknown>({
  options: (trpc: Trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: SETTING_RESET_FAILED_TOAST,
});
