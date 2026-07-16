// The preset CRUD mutations (the Presets rail section — W10 Panel A), one `createEntityMutation` per verb
// (the module-scope factory pattern — use-connections-mutations.ts precedent). Preset writes are per-USER
// entity changes; each carries its own `invalidates` refetching `preset.list` (the LIBRARY read) and, for
// update/reset, `preset.get` (the open editor). The tRPC input types are inferred (never re-declared —
// `no-client-wire-redeclare`).

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** Create a new (empty-default or seeded) preset. Refetches the library list; resolves to the created row
 *  (its id) so the caller can open it. */
export const useCreatePreset = createEntityMutation<inferInput<Trpc["preset"]["create"]>, inferOutput<Trpc["preset"]["create"]>>({
  options: (trpc) => trpc.preset.create.mutationOptions(),
  invalidates: (trpc) => [trpc.preset.list.pathFilter()],
  errorToast: "Couldn't create the preset.",
});

/** Persist an edited preset (name/config). Refetches the list (name/updatedAt) + the open editor row. */
export const useUpdatePreset = createEntityMutation<inferInput<Trpc["preset"]["update"]>, unknown>({
  options: (trpc) => trpc.preset.update.mutationOptions(),
  invalidates: (trpc) => [trpc.preset.list.pathFilter(), trpc.preset.get.pathFilter()],
  errorToast: "Couldn't save the preset.",
});

/** Delete a preset. Refetches the library list. */
export const useRemovePreset = createEntityMutation<inferInput<Trpc["preset"]["remove"]>, unknown>({
  options: (trpc) => trpc.preset.remove.mutationOptions(),
  invalidates: (trpc) => [trpc.preset.list.pathFilter()],
  errorToast: "Couldn't delete the preset.",
});

/** Reset a preset's config back to the starter arrangement. Refetches the list + the open editor row. */
export const useResetPreset = createEntityMutation<inferInput<Trpc["preset"]["resetToDefault"]>, unknown>({
  options: (trpc) => trpc.preset.resetToDefault.mutationOptions(),
  invalidates: (trpc) => [trpc.preset.list.pathFilter(), trpc.preset.get.pathFilter()],
  errorToast: "Couldn't reset the preset.",
});

/** Set (or clear) the ACTIVE-for-generation preset — patches the `seeds` section's `defaultPresetId`
 *  (settings/index.ts:398), the SAME live-flip seam persona identity uses (`useSetPersonaSeed`). A settings
 *  write, not a preset write: the preset rows never change, only which one the runner picks. `busDriven` —
 *  `updateUserSettingsSection` emits `settingsChanged` UNCONDITIONALLY and `USER_BUS_FILTERS.settingsChanged`
 *  covers `getUserSettings` (the LIST dropdown + CONTEXT Usage tab both read it), so the echo reconciles the
 *  acting device with no self-invalidate double-refetch (the persona-seed precedent). `null` clears the seed
 *  (the active-preset delete guard nulls it so a stale pointer never survives). */
export interface DefaultPresetPatchVars {
  readonly section: "seeds";
  readonly patch: { readonly defaultPresetId: string | null };
}
export const useSetDefaultPreset = createEntityMutation<DefaultPresetPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't set the active preset.",
});
