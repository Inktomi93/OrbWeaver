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

import { actorRefKey } from "@orb/contracts/rpg";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** The four HAND DOORS' shared verdict (`HandDoorResult`) read off the wire, never re-spelled: the server
 *  refuses legibly as DATA, so a reshape of that contract breaks here at compile time. Local + underived by
 *  hand on purpose — the shape has ONE home and it is the verb that returns it. */
type HandDoorVerdict = inferOutput<Trpc["rpg"]["editSnapshot"]>;

/**
 * EDITSNAP-OK — the errors-as-data reader every hand door shares.
 *
 * `editSnapshot`/`patchActor`/`dismissActor`/`promoteActor` refuse as DATA (`{ok:false, reason}`), which
 * means a refusal RESOLVES the mutation: `errorToast` cannot fire, the sticky error slot stays null, and the
 * `.mutate()` call sites — all of them fire-and-forget, because these writes reconcile through `invalidates`
 * and nobody reads the return — showed the host absolutely nothing. `editSnapshot` also rejects the WHOLE
 * patch on one bad plane, so a five-plane scene write vanished to a single over-length label with the panel
 * silently repainting its pre-write state.
 *
 * It rides the FACTORY, not the call sites: refusing-as-data is a property of the VERB, so every present and
 * future call site is covered by construction. The server's `reason` IS the message — it names the plane, the
 * path or the datum, and inventing a vaguer sentence here would throw away the only thing that makes the
 * refusal actionable.
 */
function handDoorRefusal(data: HandDoorVerdict): string | null {
  return data.ok ? null : `That change wasn't applied — ${data.reason}`;
}

/** The tracker aggregate this write repaints — taken off the proc so a reshape breaks here rather than
 *  drifting into a hand-spelled twin. */
type TrackerView = inferOutput<Trpc["rpg"]["getTrackerView"]>;

/**
 * The actor-ref key for a ref taken off the WIRE INPUT rather than off a view.
 *
 * `actorRefKey` (`\@orb/contracts/rpg`) stays the ONE projection — this only re-brands the ids on the way in.
 * The ref is `rpgActorRefSchema`, whose id fields are TRANSFORM-backed TypeIDs, and the CLIENT's tsc program
 * infers those through `inferInput` as `unknown` (the graph program resolves them fine — the two programs
 * genuinely disagree here). The values ARE the ids; `castId` is the house runtime no-op for saying so, and
 * `String()` is what makes that honest rather than an `as`-through-`unknown`. A total switch, so a fourth
 * actor kind fails to compile here exactly as it does in `actorRefKey`.
 */
function wireActorRefKey(ref: inferInput<Trpc["rpg"]["patchSheet"]>["actorRef"]): string {
  if (ref.kind === "character") {
    return actorRefKey({ kind: "character", characterId: castId<CharacterId>(String(ref.characterId)) });
  }
  if (ref.kind === "user") {
    return actorRefKey({ kind: "user", userId: castId<UserId>(String(ref.userId)) });
  }
  return actorRefKey({ kind: "cast", castKey: ref.castKey });
}

/**
 * RPG-STAT-ENTRY-REVERTS — apply a sheet patch to the cached tracker view, in place, for the ONE actor it names.
 *
 * The defect: an attribute cell is a controlled input. On blur it fires the write AND leaves edit mode in the
 * same tick, so it re-rendered from the still-STALE server read — a typed `20` visibly snapped back, and a
 * hand-authored sheet could not be filled in at all. `invalidates` repairs that a round-trip later, which is
 * exactly one round-trip too late to be believed.
 *
 * THIS WAS HALF THE FIX (2026-08-07), and the owner's repro survived it (live, 2026-08-13). The other half was
 * server-side: `patchSheet` REPLACED the whole attributes record while this fold merged key-wise, so the
 * optimistic paint was right and the settled read was wrong — the value came back for one beat and then the
 * clobbered row won. The verb now folds key-wise too (RPG-STAT-CLOBBER, `verbs/patch-sheet.ts`), and the two
 * folds are deliberate twins. The old wording blamed `?? range.min`; that floor fallback was real but it was
 * the DISGUISE — it made the loss render as a plausible `1` instead of as the em-dash it is now.
 *
 * EVERY sheet field, not just `attributes`: `className`/`flavor`/`level`/the tracker exceptions are the same
 * click-to-edit gesture against the same stale read, so covering one would leave the defect alive under the
 * others. Attributes MERGE (the patch names only the touched key); everything else REPLACES. A patch naming
 * nothing rewrites nothing.
 */
function applySheetPatch(old: TrackerView | undefined, vars: inferInput<Trpc["rpg"]["patchSheet"]>): TrackerView | undefined {
  if (old === undefined) {
    return old;
  }
  const key = wireActorRefKey(vars.actorRef);
  return {
    ...old,
    actors: old.actors.map((actor) => (actorRefKey(actor.actorRef) === key ? { ...actor, sheet: mergeSheet(actor.sheet, vars.patch) } : actor)),
  };
}

/** The attributes sub-patch folded key-wise — the CLIENT half of the server's `mergeAttributes`
 *  (RPG-STAT-CLOBBER): a number sets, an omitted key keeps, an explicit `null` CLEARS. The two folds must agree
 *  byte-for-byte or the optimistic paint and the settled read disagree, which is the exact shape of the defect
 *  this pair exists to close — the cache merged key-wise while the verb replaced the record, so a typed value
 *  survived one round-trip and then snapped back. `null` is patch vocabulary only: a cleared attribute is an
 *  ABSENT key in the view, which is what the sheet contract says a read must treat as unset. */
function mergeAttributes(current: Readonly<Record<string, number>>, patch: Readonly<Record<string, number | null>>): Record<string, number> {
  const next: Record<string, number> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

/** The sheet merge itself — every field OMITTED-means-unchanged (an MA-4 patch), attributes MERGED key-wise
 *  and the scalars replaced. Lifted out of the `map` callback so neither half carries the other's branches. */
function mergeSheet(
  sheet: TrackerView["actors"][number]["sheet"],
  patch: inferInput<Trpc["rpg"]["patchSheet"]>["patch"],
): TrackerView["actors"][number]["sheet"] {
  const { className, attributes, flavor, level, trackerGrants, trackerRevokes } = patch;
  return {
    ...sheet,
    ...(className === undefined ? {} : { className }),
    ...(flavor === undefined ? {} : { flavor }),
    ...(level === undefined ? {} : { level }),
    ...(trackerGrants === undefined ? {} : { trackerGrants }),
    ...(trackerRevokes === undefined ? {} : { trackerRevokes }),
    ...(attributes === undefined ? {} : { attributes: mergeAttributes(sheet.attributes, attributes) }),
  };
}

/** `rpg.patchSheet` — the per-actor identity sheet write (Sheet tab attribute grid). Host any actor; a
 *  member their OWN `user` ref (the server gate). Repaints the tracker view (sheet feeds Status/Sheet) —
 *  OPTIMISTICALLY first (see {@link applySheetPatch}), then from the server on settle. `readKey` is a query
 *  KEY, not a `queryFilter`: the factory's 4-phase recipe snapshots and restores exactly that entry, so a
 *  refused write rolls the cell back instead of stranding the typed value. */
export const usePatchSheet = createEntityMutation<inferInput<Trpc["rpg"]["patchSheet"]>, unknown, TrackerView>({
  options: (trpc) => trpc.rpg.patchSheet.mutationOptions(),
  optimistic: {
    readKey: (trpc, vars) => trpc.rpg.getTrackerView.queryKey({ chatId: vars.chatId }),
    update: applySheetPatch,
  },
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the sheet.",
});

/** `rpg.editSnapshot` — the hand-edit door for the IMAGE-honest snapshot planes (ambient, game trackers,
 *  plot, cast, beats) AND the lock-release channel (`patch:{}` + `releaseLocks`). Host-only in v1. The
 *  per-actor volatile plane is NOT here any more — it is op-shaped through `usePatchActor` (R1), and a patch
 *  naming `actorState` comes back refused. Repaints the whole tracker view. */
export const useEditSnapshot = createEntityMutation<inferInput<Trpc["rpg"]["editSnapshot"]>, HandDoorVerdict>({
  options: (trpc) => trpc.rpg.editSnapshot.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the change.",
  refusal: handDoorRefusal,
});

/** `rpg.patchActor` — THE op-shaped hand door for one actor's volatile row (R1): the panel sends the OPS it
 *  performed (`setTracker`, `addCondition`, `addItem`, `setWalletAmount`, …) and the server applies them
 *  against the true resolved head. It replaced the whole-`actorState` IMAGE this panel used to build from its
 *  own projections — an image that could only ever be partial (the offstage rows are in no projection) and
 *  that clobbered any model flush landing between the panel's read and the click. The FINE lock paths are
 *  derived server-side per op, so a call site names ops, never lock paths. Repaints the tracker view. */
export const usePatchActor = createEntityMutation<inferInput<Trpc["rpg"]["patchActor"]>, HandDoorVerdict>({
  options: (trpc) => trpc.rpg.patchActor.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't save the change.",
  refusal: handDoorRefusal,
});

/** `rpg.dismissActor` — THE removal gesture for the actor plane (R1's verb, R2's affordance): drops the
 *  actor's whole row, its scene presence, and every lock at or below its path. It is the counterweight that
 *  makes the plane's additive merge policy honest — before it, a hallucinated or finished NPC stayed tracked,
 *  `targetRef`-enumerated and clone-forwarded into every snapshot forever, and only a checkpoint restore (a
 *  rewind, not a gesture) ever shrank the plane. Host-only. Repaints the tracker view. */
export const useDismissActor = createEntityMutation<inferInput<Trpc["rpg"]["dismissActor"]>, HandDoorVerdict>({
  options: (trpc) => trpc.rpg.dismissActor.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't dismiss the character.",
  refusal: handDoorRefusal,
});

/** `rpg.promoteActor` — THE promotion doorway (R4), `dismissActor`'s opposite: a known character earns a
 *  durable card in the host's library + a seat in this room, and her tracked row is re-keyed onto the new
 *  character identity server-side (trackers, pack, purse, conditions, status, scene presence and hand pins all
 *  follow her). Host-only. It repaints the tracker view (she leaves the Scene cast for the Status roster) AND
 *  `chat.getChat` — the promotion adds a ROSTER PARTICIPANT, so the members surface is stale until it refetches;
 *  a panel that only invalidated its own read would leave the new seat invisible everywhere else in the room. */
export const usePromoteActor = createEntityMutation<inferInput<Trpc["rpg"]["promoteActor"]>, HandDoorVerdict>({
  options: (trpc) => trpc.rpg.promoteActor.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId }), trpc.chat.getChat.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't promote the character.",
  refusal: handDoorRefusal,
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

/** The resync's verdict read off the wire, never re-spelled (the hand-door precedent). */
type ResyncVerdict = inferOutput<Trpc["rpg"]["resyncFromStory"]>;

/**
 * RESYNC-OR — the resync's REFUSAL arm (`{ok:false, reason}`): the round could NOT run.
 *
 * The verb used to return `void`, so a provider that refused EVERY call (live: the default hosted backend
 * 400'd the structured request on every resync) was indistinguishable from a story with nothing to re-derive
 * — the button settled, the panel didn't move, and the host was told nothing at all. The server's `reason` IS
 * the message: it names whether the room connection didn't resolve, the model can't write structured state, or
 * the call itself failed, AND what to do about it. Inventing a vaguer sentence here would throw away the only
 * actionable part (the hand doors' `handDoorRefusal` reasoning, verbatim).
 *
 * The `{ok:true, rebuilt:false}` ending is NOT routed here: this seam fires `notify.error`, and a rebuild that
 * honestly found no drift is not an error. The call site (`ResyncControl`) speaks that one as an info line.
 * Rides the FACTORY, not the call site — refusing-as-data is a property of the VERB.
 */
function resyncRefusal(data: ResyncVerdict): string | null {
  return data.ok ? null : `The rebuild didn't run — ${data.reason}`;
}

/** `rpg.resyncFromStory` — the §1.3 HOST re-derive-from-the-story escape hatch (host-only; the server gate
 *  refuses a member). Runs ONE host-principal model call that re-reads a deep story window and rebuilds the
 *  drifted panel. Repaints the tracker view (every plane re-resolves off the rebuilt snapshot); the journal
 *  filter rides along because the panel's Journal tab reads the same game and a stale-time miss there would
 *  show pre-rebuild rows — the rebuild itself writes NO journal entry (VER-1a: a reconciler that appended to
 *  the archive could never be idempotent, and the host clicks this repeatedly). The rebuild writes a
 *  message-less HAND row (D124), so the chat message list has nothing to refetch — no canon row is minted. */
export const useResyncFromStory = createEntityMutation<inferInput<Trpc["rpg"]["resyncFromStory"]>, ResyncVerdict>({
  options: (trpc) => trpc.rpg.resyncFromStory.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId }), trpc.rpg.listJournal.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't resync from the story.",
  refusal: resyncRefusal,
});

/** `chat.reattributePersona` — the CHAT stamp verb, used here for the resync dialog's opt-in "restamp my
 *  messages first" arm (the `{kind:"mine"}` bulk scope). Declared in this feature's own hook home rather than
 *  imported from the persona feature: a feature never imports another feature (D70), and the shared surface a
 *  cross-feature write goes through is the WIRE. Bus-driven — the verb emits one `messageEdited` per restamped
 *  slot, which the open chat's reads already cover. The rpg rebuild that runs after it carries its own
 *  invalidates (`useResyncFromStory`). */
export const useReattributePersona = createEntityMutation<inferInput<Trpc["chat"]["reattributePersona"]>, unknown>({
  options: (trpc) => trpc.chat.reattributePersona.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't restamp your messages — the game state was left alone.",
});

/** The born-state round's verdict read off the wire, never re-spelled (the hand-door precedent). */
type PopulateVerdict = inferOutput<Trpc["rpg"]["populateFromCharacter"]>;

/**
 * POPLOUD — the born-state round's REFUSAL arm (`{ok:false, reason}`): the round could NOT run.
 *
 * The resync's `resyncRefusal` reasoning, verbatim, on its sibling: the verb used to return `void`, so a
 * provider that refused the structured request (live, on the default hosted backend) was indistinguishable
 * from a card that established nothing — the button settled, the panel didn't move, and the host was told
 * nothing at all. The server's `reason` IS the message: it names whether the room connection didn't resolve,
 * the model can't write structured state, or the call itself failed, AND what to do about it.
 *
 * The `{ok:true, populated:false}` ending is NOT routed here: this seam fires `notify.error`, and a round that
 * honestly found nothing on the card is not an error. The call site (`RpgPopulateControl`) speaks that one as
 * an info line. Rides the FACTORY, not the call site — refusing-as-data is a property of the VERB.
 */
function populateRefusal(data: PopulateVerdict): string | null {
  return data.ok ? null : `The card wasn't read — ${data.reason}`;
}

/** `rpg.populateFromCharacter` — the HOST born-state round (owner ruling 2026-08-01; host-only, the server
 *  gate refuses a member and refuses an actor with no card). ONE host-principal model call reads the
 *  character's card + the room's opening and fills what play cannot: the sheet's title/level, the starting
 *  inventory + purse, background-implied quests. Repaints the tracker view (sheet + actor volatile + quests all
 *  ride it). Like the resync it writes a message-less HAND row (D124), so the chat message list is untouched.
 *  Nothing auto-runs it — the takeover's button is its only caller.
 *
 *  POPLOUD — the door is LOUD: the verb answers with a `PopulateResult`, and the refusal arm rides the same
 *  factory seam the resync's does (below). */
export const usePopulateFromCharacter = createEntityMutation<inferInput<Trpc["rpg"]["populateFromCharacter"]>, PopulateVerdict>({
  options: (trpc) => trpc.rpg.populateFromCharacter.mutationOptions(),
  invalidates: (trpc, vars) => [trpc.rpg.getTrackerView.queryFilter({ chatId: vars.chatId })],
  errorToast: "Couldn't fill this character from their card.",
  refusal: populateRefusal,
});

/** `chat.send` — the CYOA choice-echo's `send`-behavior arm (Scene "Choice on the table", DESIGN §6 P5).
 *  A cross-feature ride on the chat proc DIRECTLY (lockdown §12 — cross-feature reads/rides go straight
 *  through the other domain's tRPC procedure, never its client; `rpg-choice-echo.tsx`'s direct
 *  `trpc.chat.listMessages` read is the live precedent) — never a features/chat hook import. `busDriven`:
 *  the turn's own bus events run the chat invalidation; the sent
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
