// The two Memory writes: the account-wide switch, and the backfill over existing chats that the turn-on confirm
// offers. Shared by the Settings section and the topbar memory chip, so both ask the same confirm and write the
// same patch.

import type { WorkloadRef } from "@orb/contracts/workloads";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { SectionPatchVars, Trpc } from "#data";
import { createEntityMutation } from "#data";

export const useSetMemoryEnabled = createEntityMutation<SectionPatchVars<"memory">, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your memory settings.",
});

// The host's strike and restore re-read the view themselves as well as through `chatUpdated`: a refused or stale
// strike emits nothing, and the stale refusal promises the host a refreshed list.

/** `chat.strikeMemory`: the host drops one remembered scene from every later reply. */
export const useStrikeMemory = createEntityMutation<inferInput<Trpc["chat"]["strikeMemory"]>, unknown>({
  options: (trpc) => trpc.chat.strikeMemory.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.memoryView.queryFilter({ chatId: vars.chatId })],
  failureShownInline: "the struck row's alert line",
});

/** `chat.restoreMemory`: the host returns a struck scene to the story. */
export const useRestoreMemory = createEntityMutation<inferInput<Trpc["chat"]["restoreMemory"]>, unknown>({
  options: (trpc) => trpc.chat.restoreMemory.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.memoryView.queryFilter({ chatId: vars.chatId })],
  failureShownInline: "the struck row's alert line",
});

/** The Memory backfill over the viewer's own chats, the opt-in the turn-on confirm offers. */
export const useStartMemoryBackfill = createEntityMutation<inferInput<Trpc["workloads"]["start"]>, WorkloadRef>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Memory is on, but the backfill over your existing chats didn't start. Run Memory backfill under Jobs.",
});
