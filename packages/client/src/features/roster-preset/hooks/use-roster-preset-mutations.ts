// The saved-roster mutations — one createEntityMutation instance per verb (the persona-hooks shape).
// create/remove emit `rosterPresetsChanged`, invalidated by the always-on user-bus subscription, so both
// are busDriven (a self-invalidates would double-refetch). `applyToChat` mutates the CHAT, not the
// library: its covering event is the chat bus's `chatUpdated` (the injected chat verbs fan it), so it is
// busDriven too — the roster/config surfaces of an OPEN room refetch off that tick. Result/view types
// come from `@orb/contracts/roster-preset` (the one wire home — no local type mint).

import type { ApplyRosterPresetResult, RosterPresetView } from "@orb/contracts/roster-preset";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useCreateRosterPreset = createEntityMutation<inferInput<Trpc["rosterPreset"]["create"]>, RosterPresetView>({
  options: (trpc) => trpc.rosterPreset.create.mutationOptions(),
  busDriven: true, // emits `rosterPresetsChanged` → USER_BUS_FILTERS covers rosterPreset.path.
  errorToast: "Couldn't save the roster.",
});

export const useUpdateRosterPreset = createEntityMutation<inferInput<Trpc["rosterPreset"]["update"]>, RosterPresetView>({
  options: (trpc) => trpc.rosterPreset.update.mutationOptions(),
  // The response is the full detail `rosterPreset.get` serves, so the editor shows its own write at once.
  echo: (trpc, vars) => trpc.rosterPreset.get.queryKey({ presetId: vars.presetId }),
  busDriven: true, // emits `rosterPresetsChanged` → USER_BUS_FILTERS covers rosterPreset.path.
  errorToast: "Couldn't save the roster.",
});

export const useRemoveRosterPreset = createEntityMutation<inferInput<Trpc["rosterPreset"]["remove"]>, unknown>({
  options: (trpc) => trpc.rosterPreset.remove.mutationOptions(),
  busDriven: true, // emits `rosterPresetsChanged` → USER_BUS_FILTERS covers rosterPreset.path.
  errorToast: "Couldn't delete the roster.",
});

export const useApplyRosterPreset = createEntityMutation<inferInput<Trpc["rosterPreset"]["applyToChat"]>, ApplyRosterPresetResult>({
  options: (trpc) => trpc.rosterPreset.applyToChat.mutationOptions(),
  busDriven: true, // the injected chat verbs fan `chatUpdated` — the room's own freshness plane.
  errorToast: "Couldn't apply the roster to this chat.",
});
