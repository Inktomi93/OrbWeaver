// The theme-library mutations (themes-design §4) — the ONE mutation factory (`createEntityMutation`).
// PD user-bus lane: the theme verbs emit `themesChanged` (`USER_BUS_FILTERS` covers listThemes + getTheme)
// and the SELECT verb emits `settingsChanged` (covers getUserSettings). That subscription is ALWAYS on
// (home-page.tsx), so create/duplicate/update/select are `busDriven` (the echo reconciles this device + B).
//   verb        user-bus event    client filters
//   create      themesChanged     listThemes.path + getTheme.path
//   duplicate   themesChanged     listThemes.path + getTheme.path
//   update      themesChanged     listThemes.path + getTheme.path
//   select      settingsChanged   getUserSettings.path (rides updateUserSettingsSection)
// EXCEPTION — `remove` is NOT busDriven: a delete may orphan `theme.selectedThemeId` (→ Hearth default), so
// it must ALSO refetch `getUserSettings`, which `themesChanged` does NOT cover (that's a user-settings read,
// a distinct member). It keeps ONLY that uncovered key; `listThemes` is dropped (the `themesChanged` echo
// covers it — keeping it would double-refetch).

import type { CreateThemeInput, Theme, UpdateThemeInput } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

export const useCreateTheme = createEntityMutation<CreateThemeInput, Theme>({
  options: (trpc) => trpc.settings.createTheme.mutationOptions(),
  busDriven: true, // emits `themesChanged` → USER_BUS_FILTERS covers listThemes + getTheme.
  errorToast: "Couldn't create the theme.",
});

export interface DuplicateThemeVars {
  readonly id: ThemeId;
  readonly name?: string;
}
export const useDuplicateTheme = createEntityMutation<DuplicateThemeVars, Theme>({
  options: (trpc) => trpc.settings.duplicateTheme.mutationOptions(),
  busDriven: true, // emits `themesChanged` → USER_BUS_FILTERS covers listThemes + getTheme.
  errorToast: "Couldn't duplicate the theme.",
});

export interface UpdateThemeVars {
  readonly id: ThemeId;
  readonly input: UpdateThemeInput;
}
export const useUpdateTheme = createEntityMutation<UpdateThemeVars, Theme>({
  options: (trpc) => trpc.settings.updateTheme.mutationOptions(),
  busDriven: true, // emits `themesChanged` → USER_BUS_FILTERS covers listThemes + getTheme.
  errorToast: "Couldn't save the theme.",
});

export interface RemoveThemeVars {
  readonly id: ThemeId;
}
export const useRemoveTheme = createEntityMutation<RemoveThemeVars, void>({
  options: (trpc) => trpc.settings.removeTheme.mutationOptions(),
  // `themesChanged` (emitted) covers listThemes/getTheme via the always-on user bus; only `getUserSettings`
  // (the possibly-orphaned `selectedThemeId`) is uncovered, so THAT is the sole kept invalidate.
  invalidates: (trpc) => [trpc.settings.getUserSettings.queryFilter()],
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
  busDriven: true, // updateUserSettingsSection emits `settingsChanged` → USER_BUS covers getUserSettings.
  errorToast: "Couldn't switch the theme.",
});
