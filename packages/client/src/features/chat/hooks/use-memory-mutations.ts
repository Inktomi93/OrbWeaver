// The two Memory writes: the account-wide switch, and the backfill over existing chats that the turn-on confirm
// offers. Shared by the Settings section and the topbar memory chip, so both ask the same confirm and write the
// same patch.

import type { WorkloadRef } from "@orb/contracts/workloads";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

interface MemoryPatchVars {
  readonly section: "memory";
  readonly patch: { readonly enabled: boolean };
}

export const useSetMemoryEnabled = createEntityMutation<MemoryPatchVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your memory settings.",
});

/** The Memory backfill over the viewer's own chats, the opt-in the turn-on confirm offers. */
export const useStartMemoryBackfill = createEntityMutation<inferInput<Trpc["workloads"]["start"]>, WorkloadRef>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Memory is on, but the backfill over your existing chats didn't start. Run Memory backfill under Jobs.",
});
