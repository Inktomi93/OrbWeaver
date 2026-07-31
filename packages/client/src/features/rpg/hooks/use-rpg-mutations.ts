// The takeover's EDIT-in-place write verbs (Context-Panel-Program §3.2 — every block editable-in-place is
// the LAW, not an option). Each is a module-scope `createEntityMutation` (§13.1 — the ONE mutation home; a
// call site never hand-rolls `useMutation`). The rpg feature bus is LIVE-ONLY and could drop a tick, so
// these reconcile via EXPLICIT `invalidates` on the rpg tracker read (not `busDriven`, which only routes the
// CHAT bus through onSettled) — the write repaints the panel even if the separate rpg-bus round-trip is
// missed. Vars reuse the proc's OWN `inferInput` (the workloads-mutation precedent) so a wire-schema reshape
// breaks here at compile time, never a re-spelled union at the call site (§5.5).
//
// Runtime authz lives INSIDE each verb: `patchSheet` = host any actor / a member their own `user` ref;
// `editSnapshot` + `upsertQuest`/`deleteQuest` + the three `*JournalEntry` verbs = host-only (each opens with
// `resolveHost`; a member gets a leak-free FORBIDDEN). The panel's `canEditShared`/`isHost` gates mirror the
// shared-plane arm so a member never SEES a control that would refuse.

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

/** `rpg.upsertQuest` — the hand arm of the quest plane (Quests tab cards + Scene tab goal echo). `questId`
 *  present ⇒ update, absent ⇒ create. Host-only in v1. Repaints the tracker view (quests ride the snapshot). */
export const useUpsertQuest = createEntityMutation<inferInput<Trpc["rpg"]["upsertQuest"]>, unknown>({
  options: (trpc) => trpc.rpg.upsertQuest.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the goal.",
});

/** `rpg.updateConfig` — the ONE config write door (host): steering note, extraction knob, cast-field
 *  schemas, relationship hints, the deception knobs, orb-pinning, and the #40 engaged toggle. Repaints
 *  the config view (the GM console's own read), the tracker view (pinnedOrbs changes the band; castFields
 *  changes Scene), AND `chat.getChat` (an engaged flip re-writes the pointer MIRROR the takeover gate
 *  reads — the tabs must appear/vanish on the same commit, not wait for a bus tick). */
export const useUpdateConfig = createEntityMutation<inferInput<Trpc["rpg"]["updateConfig"]>, unknown>({
  options: (trpc) => trpc.rpg.updateConfig.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.rpg.getConfigView.queryFilter({ chatId: vars.chatId }),
    trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId }),
    trpc.chat.getChat.queryFilter({ chatId: vars.chatId }),
  ],
  errorToast: "Couldn't save the game settings.",
});

/** `rpg.createGame` — the #40 FRONT DOOR (host): births the lite game + writes the chat pointer. Repaints
 *  `chat.getChat` (the pointer the takeover gate reads) so the game tabs appear on the same commit. */
export const useCreateGame = createEntityMutation<inferInput<Trpc["rpg"]["createGame"]>, unknown>({
  options: (trpc) => trpc.rpg.createGame.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't start the game.",
});

/** `rpg.detachDanglingPointer` — the §3.3 dangling-pointer HEAL (host): null a `metadata.rpg` pointer at a
 *  game that no longer exists (a pre-fix fork / any desync). Repaints `chat.getChat` (the pointer the takeover
 *  gate reads) so the whole game takeover collapses to a plain chat on the same commit. */
export const useDetachDanglingPointer = createEntityMutation<inferInput<Trpc["rpg"]["detachDanglingPointer"]>, unknown>({
  options: (trpc) => trpc.rpg.detachDanglingPointer.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.chat.getChat.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't detach the game.",
});

/** `rpg.resyncFromStory` — the §1.3 HOST re-derive-from-the-story escape hatch (host-only; the server gate
 *  refuses a member). Runs ONE host-principal model call that re-reads a deep story window and rebuilds the
 *  drifted panel. Repaints the tracker view (every plane re-resolves off the rebuilt snapshot) + the journal
 *  (the rebuild can stamp a resync entry). The rebuild writes a fresh snapshot, so the CHAT message list also
 *  refetches for the silent anchor slot (invisible — empty content). */
export const useResyncFromStory = createEntityMutation<inferInput<Trpc["rpg"]["resyncFromStory"]>, unknown>({
  options: (trpc) => trpc.rpg.resyncFromStory.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId }), trpc.rpg.listJournal.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't resync from the story.",
});

/** `chat.send` — the CYOA choice-echo's `send`-behavior arm (Scene "Choice on the table", DESIGN §6 P5).
 *  A cross-feature ride on the chat proc DIRECTLY ([workloads.subscribe cross-feature] — never a
 *  features/chat hook import). `busDriven`: the turn's own bus events run the chat invalidation; the sent
 *  turn is never read back (chat-turn-surface-bus-driven). */
export const useSendChoice = createEntityMutation<inferInput<Trpc["chat"]["send"]>, unknown>({
  options: (trpc) => trpc.chat.send.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't send your choice.",
});

/** `rpg.deleteQuest` — remove a quest from the current snapshot AND clear its `quests.<id>` lock (Quests
 *  tab card action; host-only, the verb refuses a member). Repaints the tracker view (quests ride the
 *  snapshot, and the Scene goal echo is the same rows through a filter). */
export const useDeleteQuest = createEntityMutation<inferInput<Trpc["rpg"]["deleteQuest"]>, unknown>({
  options: (trpc) => trpc.rpg.deleteQuest.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't delete the goal.",
});

/** `rpg.addJournalEntry` — the HAND arm of the chronicle (Journal → All; host). Stamps a `variantId: NULL`
 *  every-lineage entry. Repaints the paged journal read (the tab's only source for beats). */
export const useAddJournalEntry = createEntityMutation<inferInput<Trpc["rpg"]["addJournalEntry"]>, unknown>({
  options: (trpc) => trpc.rpg.addJournalEntry.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.listJournal.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't add the journal entry.",
});

/** `rpg.editJournalEntry` — patch an entry's type/title/content (host). Reaches MODEL-written entries too
 *  (the verb's recovery path), so every beat row is host-editable, not just hand ones. */
export const useEditJournalEntry = createEntityMutation<inferInput<Trpc["rpg"]["editJournalEntry"]>, unknown>({
  options: (trpc) => trpc.rpg.editJournalEntry.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.listJournal.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the journal entry.",
});

/** `rpg.deleteJournalEntry` — remove a chronicle entry (host; a foreign game's id is a leak-free 404). */
export const useDeleteJournalEntry = createEntityMutation<inferInput<Trpc["rpg"]["deleteJournalEntry"]>, unknown>({
  options: (trpc) => trpc.rpg.deleteJournalEntry.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.listJournal.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't delete the journal entry.",
});

/** `rpg.createCheckpoint` — mint a MARK on the current resolved snapshot (Journal → Marks; host). */
export const useCreateCheckpoint = createEntityMutation<inferInput<Trpc["rpg"]["createCheckpoint"]>, unknown>({
  options: (trpc) => trpc.rpg.createCheckpoint.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.listCheckpoints.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't create the mark.",
});

/** `rpg.restoreCheckpoint` — clone a marked snapshot forward onto a fresh slot (Journal → Marks; host).
 *  Repaints everything (the restore births a new resolved-current snapshot). */
export const useRestoreCheckpoint = createEntityMutation<inferInput<Trpc["rpg"]["restoreCheckpoint"]>, unknown>({
  options: (trpc) => trpc.rpg.restoreCheckpoint.mutationOptions(),
  invalidates: (trpc, vars) => [
    trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId }),
    trpc.rpg.listCheckpoints.queryFilter({ chatId: vars.chatId }),
    trpc.rpg.listJournal.queryFilter({ chatId: vars.chatId }),
  ],
  errorToast: "Couldn't restore the mark.",
});
