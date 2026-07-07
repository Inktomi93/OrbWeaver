// The theme-library mutations (themes-design §4) — the ONE mutation factory (`createEntityMutation`)
// instanced per verb, all bus-agnostic → cache invalidation. `listThemes` refetches after every write so
// the picker/library reflow; `getUserSettings` refetches after a SELECT or a DELETE (a delete may orphan
// the `selectedThemeId`, which resolves back to the Hearth default). Seeds are un-mutable server-side
// (fetchOwned), so duplicate/update/delete only ever touch owned rows.

import type { CreateThemeInput, Theme, UpdateThemeInput } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

export const useCreateTheme = createEntityMutation<CreateThemeInput, Theme>({
  options: (trpc) => trpc.settings.createTheme.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.listThemes.queryFilter()],
  errorToast: "Couldn't create the theme.",
});

export interface DuplicateThemeVars {
  readonly id: ThemeId;
  readonly name?: string;
}
export const useDuplicateTheme = createEntityMutation<DuplicateThemeVars, Theme>({
  options: (trpc) => trpc.settings.duplicateTheme.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.listThemes.queryFilter()],
  errorToast: "Couldn't duplicate the theme.",
});

export interface UpdateThemeVars {
  readonly id: ThemeId;
  readonly input: UpdateThemeInput;
}
export const useUpdateTheme = createEntityMutation<UpdateThemeVars, Theme>({
  options: (trpc) => trpc.settings.updateTheme.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.settings.listThemes.queryFilter(),
    trpc.settings.getTheme.queryFilter({ id: vars.id }),
  ],
  errorToast: "Couldn't save the theme.",
});

export interface RemoveThemeVars {
  readonly id: ThemeId;
}
export const useRemoveTheme = createEntityMutation<RemoveThemeVars, void>({
  options: (trpc) => trpc.settings.removeTheme.mutationOptions(),
  invalidates: (trpc) => [
    trpc.settings.listThemes.queryFilter(),
    trpc.settings.getUserSettings.queryFilter(),
  ],
  errorToast: "Couldn't delete the theme.",
});

// SELECT — writes `theme.selectedThemeId` through the section-patch verb (the same live-flip seam the
// appearance pane uses). `null` selects the Hearth default (also the Tier-3 anti-brick "reset").
export interface SelectThemeVars {
  readonly section: "theme";
  readonly patch: { readonly selectedThemeId: string | null };
}
export const useSelectTheme = createEntityMutation<SelectThemeVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getUserSettings.queryFilter()],
  errorToast: "Couldn't switch the theme.",
});
