// The theme-library mutations. create/duplicate/update/select are busDriven (the theme verbs emit
// themesChanged, select emits settingsChanged, both covered by the always-on user bus). `remove` is NOT
// busDriven: a delete may orphan theme.selectedThemeId, so it must also refetch getUserSettings, which
// themesChanged doesn't cover — it keeps only that uncovered key.

import type { CreateThemeInput, Theme } from "@orb/contracts/theme";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { SectionPatchVars, Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useCreateTheme = createEntityMutation<CreateThemeInput, Theme>({
  options: (trpc) => trpc.settings.createTheme.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't create the theme.",
});

/** The single-theme import door: the file's TEXT (an Orbweaver export, an Orbweaver backup or a raw
 *  SillyTavern theme) plus its name, through the same server op the backup restore calls. The server's
 *  refusal reason is what the caller renders. */
export const useImportThemeFile = createEntityMutation<
  { readonly fileText: string; readonly filename: string },
  { readonly created: boolean; readonly name: string; readonly renamedFrom: string | null }
>({
  options: (trpc) => trpc.settings.importThemeFile.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't import the theme.",
});

export const useDuplicateTheme = createEntityMutation<inferInput<Trpc["settings"]["duplicateTheme"]>, Theme>({
  options: (trpc) => trpc.settings.duplicateTheme.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't duplicate the theme.",
});

export const useUpdateTheme = createEntityMutation<inferInput<Trpc["settings"]["updateTheme"]>, Theme>({
  options: (trpc) => trpc.settings.updateTheme.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save the theme.",
});

export const useRemoveTheme = createEntityMutation<inferInput<Trpc["settings"]["removeTheme"]>, void>({
  options: (trpc) => trpc.settings.removeTheme.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getUserSettings.queryFilter()],
  errorToast: "Couldn't delete the theme.",
});

/** Writes `theme.selectedThemeId`; `null` selects the Hearth default (the anti-brick reset). */
export const useSelectTheme = createEntityMutation<SectionPatchVars<"theme">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch the theme.",
});
