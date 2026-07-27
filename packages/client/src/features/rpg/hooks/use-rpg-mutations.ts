// The takeover's EDIT-in-place write verbs (Context-Panel-Program §3.2 — every block editable-in-place is
// the LAW, not an option). Each is a module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a
// call site never hand-rolls `useMutation`). The rpg feature bus is LIVE-ONLY and could drop a tick, so
// these reconcile via EXPLICIT `invalidates` on the rpg tracker read (not `busDriven`, which only routes the
// CHAT bus through onSettled) — the write repaints the panel even if the separate rpg-bus round-trip is
// missed. Vars reuse the proc's OWN `inferInput` (the workloads-mutation precedent) so a wire-schema reshape
// breaks here at compile time, never a re-spelled union at the call site (§5.5).
//
// Runtime authz lives INSIDE each verb: `patchSheet` = host any actor / a member their own `user` ref;
// `editSnapshot` + `upsertQuest` = host-only in v1 (a member gets a leak-free FORBIDDEN). The panel's
// `canEditShared` gate mirrors the shared-plane arm so a member never SEES a control that would refuse.

import type { inferInput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** `rpg.patchSheet` — the per-actor identity sheet write (Sheet tab attribute grid). Host any actor; a
 *  member their OWN `user` ref (the server gate). Repaints the tracker view (sheet feeds Status/Sheet). */
export const usePatchSheet = createEntityMutation<inferInput<Trpc["rpg"]["patchSheet"]>, unknown>({
  options: (trpc) => trpc.rpg.patchSheet.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the sheet.",
});

/** `rpg.editSnapshot` — the hand-edit door for the swipe-volatile plane (pools, wallet, ambient, widget
 *  values). Host-only in v1. The `patch` is a partial snapshot-state overlay under the [merge-clear]
 *  contract. Repaints the whole tracker view (every plane reads the resolved-current snapshot). */
export const useEditSnapshot = createEntityMutation<inferInput<Trpc["rpg"]["editSnapshot"]>, unknown>({
  options: (trpc) => trpc.rpg.editSnapshot.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the change.",
});

/** `rpg.upsertQuest` — the hand arm of the quest plane (Scene tab goal lines). `questId` present ⇒ update,
 *  absent ⇒ create. Host-only in v1. Repaints the tracker view (quests ride the snapshot). */
export const useUpsertQuest = createEntityMutation<inferInput<Trpc["rpg"]["upsertQuest"]>, unknown>({
  options: (trpc) => trpc.rpg.upsertQuest.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the goal.",
});
