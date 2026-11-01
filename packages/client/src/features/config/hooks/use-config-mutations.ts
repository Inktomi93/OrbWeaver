import { createEntityMutation } from "#data";

export const useResetUserConfig = createEntityMutation<void, unknown>({
  options: (trpc) => trpc.settings.resetUserConfig.mutationOptions(),
  busDriven: true, // resetUserConfig emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't reset your settings.",
});
