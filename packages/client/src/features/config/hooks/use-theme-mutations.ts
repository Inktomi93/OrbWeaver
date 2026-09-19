// The theme-library mutations. create/duplicate/update/select are busDriven (the theme verbs emit
// themesChanged, select emits settingsChanged, both covered by the always-on user bus). `remove` is NOT
// busDriven: a delete may orphan theme.selectedThemeId, so it must also refetch getUserSettings, which
// themesChanged doesn't cover — it keeps only that uncovered key.

import type { CreateThemeInput, Theme, UpdateThemeInput } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

export const useCreateTheme = createEntityMutation<CreateThemeInput, Theme>({
  options: (trpc) => trpc.settings.createTheme.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't create the theme.",
});

export interface DuplicateThemeVars {
  readonly id: ThemeId;
  readonly name?: string;
}
export const useDuplicateTheme = createEntityMutation<DuplicateThemeVars, Theme>({
  options: (trpc) => trpc.settings.duplicateTheme.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't duplicate the theme.",
});

export interface UpdateThemeVars {
  readonly id: ThemeId;
  readonly input: UpdateThemeInput;
}
export const useUpdateTheme = createEntityMutation<UpdateThemeVars, Theme>({
  options: (trpc) => trpc.settings.updateTheme.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save the theme.",
});

export interface RemoveThemeVars {
  readonly id: ThemeId;
}
export const useRemoveTheme = createEntityMutation<RemoveThemeVars, void>({
  options: (trpc) => trpc.settings.removeTheme.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getUserSettings.queryFilter()],
  errorToast: "Couldn't delete the theme.",
});

/** Writes `theme.selectedThemeId`; `null` selects the Hearth default (the anti-brick reset). */
export interface SelectThemeVars {
  readonly section: "theme";
  readonly patch: { readonly selectedThemeId: string | null };
}
export const useSelectTheme = createEntityMutation<SelectThemeVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch the theme.",
});
