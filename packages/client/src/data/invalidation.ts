// Central invalidation seam: bus handlers call invalidate(event)/invalidateUser(event), mutations
// route `invalidates` filters through invalidateFilters — nothing else calls invalidateQueries
// directly (gate `no-inline-invalidate-outside-seam`).
//
// The chat half ALSO APPLIES the event's `view` carrier into the room's message-list cache before it
// invalidates (`applyCanonView`) — the refetch stays, but the row it will confirm is already correct.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import { busDupCheck, busInvalidate, IS_DEV, runAfterViewTransition } from "#lib";
import { collapseFilters, filterKeyName } from "./collapse-filters.ts";
import { allAutomationRoomFilters, automationEventFilters } from "./invalidation-automation.ts";
import { applyCanonView } from "./invalidation-carrier.ts";
import type { InvalidateFilter } from "./invalidation-reads.ts";
import {
  // The RPG bus's whole map lives in the reads module, and the user bus's in `invalidation-user.ts`: this file stays
  // under the 450-line cap — seam unchanged.
  allRpgGameFilters,
  chatCanonReads,
  chatReads,
  hiddenRevealRead,
  promptPreviewReads,
  ROOM_ENTITY_FILTERS,
  RPG_BUS_FILTERS,
  reactionsRead,
  roomEntityHealReads,
  roomWasDark,
  runtimeVariablesRead,
} from "./invalidation-reads.ts";
import { allUserRootFilters, identityFilters, USER_BUS_FILTERS } from "./invalidation-user.ts";
import type { Trpc } from "./trpc.ts";

export type { InvalidateFilter } from "./invalidation-reads.ts";

export interface Invalidation {
  /** The bus half — routes a `ChatBusEvent` through the exhaustive map. Fire-and-forget. */
  readonly invalidate: (event: ChatBusEvent) => void;
  /** The user-bus half — routes a `UserBusEvent` through `USER_BUS_FILTERS`. Fire-and-forget. */
  readonly invalidateUser: (event: UserBusEvent) => void;
  /** The rpg-bus half — routes an `RpgBusEvent` through `RPG_BUS_FILTERS` (the feature-root game bus,
   *  `rpg.stream`). Fire-and-forget. */
  readonly invalidateRpg: (event: RpgBusEvent) => void;
  /** The automation-room half — routes an `AutomationBusEvent` through its exhaustive central map. */
  readonly invalidateAutomation: (event: AutomationBusEvent) => void;
  /** Gap-heal — on automation-room reconnect, blanket-invalidate the durable reads its live-only events move. */
  readonly gapHealAutomation: (chatId: ChatId) => void;
  /** Gap-heal — on rpg-bus (re)connect for an open game, blanket-invalidate every read that game covers. */
  readonly gapHealRpg: (chatId: ChatId) => void;
  /** Gap-heal — on user-bus RE-connect, blanket-invalidate every filter the user map covers. Never on the
   *  first connect of a page load: that mount's own reads ARE the fresh state (`use-user-bus.ts`). */
  readonly invalidateAllUserRoots: () => void;
  /** The IDENTITY reads — `sessions.me` plus the two reads (`settings.getUserSettings`/`persona.list`)
   *  a composed viewer read would derive from. Called by the session-recovery ladder's resume rung,
   *  which has NO event to route: a tab that just
   *  re-authenticated may be a different principal (or the same one with a changed role), and the probe that
   *  discovered it is an `/api/auth/me` fetch, not a bus tick. The SERVER-announced half of the same three
   *  reads rides the `identityChanged` member (W7b) — one filter helper, two entry points. */
  readonly invalidateIdentity: () => void;
  /** The mutation half — `createEntityMutation.onSettled` routes its filters through here. */
  readonly invalidateFilters: (filters: readonly InvalidateFilter[]) => void;
}

type BusFilterMap = {
  readonly [K in ChatBusEvent["type"]]: (event: Extract<ChatBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const nothing = (): readonly InvalidateFilter[] => [];

const BUS_FILTERS: BusFilterMap = {
  delta: nothing,
  reasoningStreamDone: nothing,
  // Turn ACCEPTED — a slot-open signal only (the reducer opens the pending slot); nothing durable changed, so
  // no refetch, exactly like turnStarted.
  turnAccepted: nothing,
  turnStarted: nothing,
  // #313 — a transient store-axis feed for the header brain-icon; nothing durable changed, no refetch.
  memoryRecall: nothing,
  warning: nothing,
  worldInfoActivated: nothing,

  // Canon-terminal commit — the open chat's canon only; the chat list/character-library recency is
  // driven by the user-bus chatsChanged fan on this same moment (avoids a triple-invalidate).
  messageCommitted: (_e, trpc) => [...chatCanonReads(trpc), ...hiddenRevealRead(trpc), ...runtimeVariablesRead(trpc)],
  messageEdited: (_e, trpc) => chatReads(trpc),
  messageHidden: (_e, trpc) => chatReads(trpc),
  // A pointer flip changes both canon and the RPG lineage projected from that selected variant. No RPG
  // event fires because selection writes no RPG row, so the chat event must repaint the two lineage reads.
  variantSelected: (e, trpc) => [...chatReads(trpc), trpc.rpg.getTrackerView.queryFilter({ chatId: e.chatId }), trpc.rpg.listJournal.pathFilter()],
  messagesDeleted: (_e, trpc) => chatReads(trpc),
  messagesReordered: (_e, trpc) => chatReads(trpc),
  reasoningEdited: (_e, trpc) => chatReads(trpc),
  reasoningCleared: (_e, trpc) => chatReads(trpc),

  turnCompleted: (_e, trpc) => [...chatCanonReads(trpc), ...runtimeVariablesRead(trpc)],
  turnAborted: (_e, trpc) => chatReads(trpc),

  // A re-anchored persona rewrites `{{user}}` (and the persona block) in the NEXT turn's prompt — the room
  // read AND the prompt preview.
  personaSwitched: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId }), trpc.worldInfo.listForChat.pathFilter(), ...promptPreviewReads(trpc)],

  reactionsChanged: (_e, trpc) => reactionsRead(trpc),
  // Attachment changes move the ASSEMBLY POOL — the WI reads, the room, and the prompt preview built from it.
  wiBookAttached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],
  wiBookDetached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],
  wiEntryAttached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],
  wiEntryDetached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],
  wiEntryScopeChanged: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],

  // NOTHING — the chat list is driven by the user-bus `chatsChanged` fan the SAME commit emits (both
  // producers, `verbs/start-chat.ts` + `verbs/fork.ts`, call `emitChatChanged` on the line after
  // `emit({type:"chatCreated"})`). That fan reaches every present member on every device; this chat-bus arm
  // only ever reaches the creator (through the draft→committed from-zero replay seed in `use-chat-bus.ts`),
  // so its `listChats` row was a pure second wire fetch of the list the fan had already refetched.
  chatCreated: nothing,
  chatDeleted: (e, trpc) => [...chatReads(trpc), trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  // THE LIVE-ONLY LANE'S HEAL (the entity→room bridge §3.4/§3.7). A `roomEntityChanged` is never replayed,
  // so a device that was dark through a fan learns about it on its next attach — and `chatOpened` re-fires
  // on EVERY (re)attach (reopen, reconnect, shed-restart), which is exactly the moment that gap closes.
  //
  // THE HEAL IS DERIVED OVER `ROOM_ENTITY_KINDS`, NEVER HAND-LISTED (#2494, owner ruling 2026-09-20). It
  // shipped naming `getMemberCard` and nothing else, and then stood still while `regex` (#1733) and
  // `databank` (#2471) joined the kind tuple — two member-visible room reads a dark co-member could never
  // catch up on. `roomEntityHealReads` folds `ROOM_ENTITY_HEAL_FILTERS`, whose mapped type makes a sixth
  // kind fail tsc until it states its heal. The live-only ECONOMY survives unchanged; what changed is that
  // the heal it depends on now covers every kind that has a member-visible room read. Each arm's reads are
  // free when their surface is shut — `invalidateQueries` is a no-op for a key with no cache entry.
  // Deliberately NOT widened with the fit/preview reads: those would re-pay a BOOT-4X-class fetch on every
  // room open, and their staleness bound is one turn (the next canon terminal refetches them through the
  // durable replay).
  //
  // THE HEAL SURVIVES; ITS INPUT NARROWED (#514). The whole row is gated on `roomWasDark` — it fires on
  // every attach that could have MISSED something, and never on a room's FIRST attach in a page load, where
  // the reads it would refetch were issued by that same open. That first-attach refetch was the third hop
  // of the measured chat-open waterfall: `getChat` landed with the canon at ~60ms and this event re-fetched
  // it 24ms later, at ~300ms of round-trip, for a row nothing could have changed. It is the SAME argument
  // BOOT-4X already made for the reconnect gap-heal, at room granularity — which is why the answer comes
  // from the room registry's own live-edge ledger rather than a second clock here. #2494 brought the
  // member-card read under that same gate: it had stayed ungated from before #514, and a first attach
  // cannot have missed a fan either (the dialog is not even open in that commit).
  chatOpened: (e, trpc) => (roomWasDark(e.chatId) ? [trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...roomEntityHealReads(e.chatId, trpc)] : []),
  historyTruncated: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  // The roster/group/override/membership catch-all ("refetch the chat detail"). `getGroupConfig` rides
  // here EXPLICITLY: it is the Group tab's OWN read of the `chats.metadata.group` sub-blob and does not
  // live under `getChat`, so without this a second tab/device sitting in the same room kept showing the
  // PREVIOUS room behavior forever (staleTime is Infinity and refetchOnWindowFocus is off — the bus is the
  // only freshness driver). The setter's own `invalidates` only ever covered the writing tab.
  // `listChatInjections` rides here for the SAME reason as `getGroupConfig`: the injections manager reads the
  // `chat_injections` rows through their OWN proc (not under `getChat`), and every injection write emits this
  // catch-all (`verbs/chat-lifecycle.ts` set/delete). Without the row, only the writing tab reconciled — a
  // member (or the host's second tab) sat on the pre-edit splice list forever.
  chatUpdated: (e, trpc) => [
    ...chatReads(trpc),
    trpc.worldInfo.listForChat.pathFilter(),
    trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
    trpc.chat.getNextTurnConnection.queryFilter({ chatId: e.chatId }),
    trpc.chat.getGroupConfig.queryFilter({ chatId: e.chatId }),
    trpc.chat.listChatInjections.queryFilter({ chatId: e.chatId }),
    // `getUserMacroPicks` rides here for the SAME reason as `getGroupConfig`/`listChatInjections`: the MU
    // picks pane reads the room's `chats.user_macro_values` through its OWN proc (not under `getChat`), and
    // `setUserMacroValues` emits this catch-all. Without the row only the writing tab reconciled — a second
    // member sat on the pre-pick bag forever (staleTime is Infinity; the bus is the only driver).
    trpc.chat.getUserMacroPicks.queryFilter({ chatId: e.chatId }),
    // `getVariablePicks` — the SAME pane's other knob family, the same argument: its picks half is the room's
    // `chats.variableValues`, read through its own proc, and `setVariables`/`clearVariables` emit this
    // catch-all.
    trpc.chat.getVariablePicks.queryFilter({ chatId: e.chatId }),
    // B7 — `listReactions` carries the room's RESOLVED `reactionsEnabled` verdict and `setReactionsEnabled` emits
    // THIS catch-all; on `reactionsChanged` alone a host's off-flip would leave every member's pills/doors standing.
    trpc.chat.listReactions.queryFilter({ chatId: e.chatId }),
    // `databank.listActiveForChat` — the per-chat documents rack, riding this event for TWO drivers:
    //   • MEMBERSHIP. The D85 union is membership-derived (`databank/persistence/scope.ts`): a human member
    //     joining/leaving credits or withdraws THEIR global documents, and a roster character
    //     joining/leaving does the same for theirs. `chatUpdated` is the documented roster/handoff event,
    //     so it is the correct driver — nothing else covered this, and the rack would have shown the
    //     pre-roster set until the panel was closed and reopened.
    //   • THE D85 VISIBILITY WRITE. `chat.setChatDocumentVisibility` emits this event, which is why that
    //     mutation is `busDriven` rather than carrying its own filter — and it is what repaints a second
    //     host device instead of only the tab that toggled.
    // Free when the panel is closed: `invalidateQueries` is a no-op for a key with no cache entry.
    trpc.databank.listActiveForChat.queryFilter({ chatId: e.chatId }),
    // `chat.listEffectiveRegex` (#1742) — the SAME two drivers as the rack above: the ROSTER (each seated
    // character is its own tier group) and the write (`chat.setRegexAllow` emits this catch-all, which is
    // why its mutation is `busDriven`). Host-gated ⇒ free for a member.
    trpc.chat.listEffectiveRegex.queryFilter({ chatId: e.chatId }),
    trpc.rpg.getGame.queryFilter({ chatId: e.chatId }), // both judge the HOST's connection; a handoff emits only this
    trpc.rpg.getTrackerView.queryFilter({ chatId: e.chatId }),
  ],

  // THE ENTITY→ROOM BRIDGE (design §3.7). An owner-plane entity edit somewhere else in the box moved
  // something THIS room renders or assembles. Dispatches on `event.entity` through a Record over
  // `RoomEntityKind` — the SAME union the server's reach table and the gate lane key on, so a fourth kind
  // fails tsc here until it names its reads.
  //
  // NARROW ON PURPOSE, and this is the whole reason the bridge did not reuse `chatUpdated`: that row
  // refetches the canon reads + the chat list + `getChat` + six chat-scoped reads, and `invalidateQueries`
  // CANCELS AND RESTARTS an in-flight fetch — so a card editor's autosave would storm every open member
  // device with full-room refetches. Each row below is the reads that entity actually moves.
  roomEntityChanged: (e, trpc) => ROOM_ENTITY_FILTERS[e.entity](e.chatId, trpc),
};

export function createInvalidation(deps: { readonly queryClient: QueryClient; readonly trpc: Trpc }): Invalidation {
  const invalidateFilters = (filters: readonly InvalidateFilter[]): void => {
    const collapsed = collapseFilters(filters);
    // A wire confirmation repainting a cold pane mid-crossfade is motion jank; outside native motion this
    // seam stays synchronous, and the already-applied event carrier remains visible immediately either way.
    runAfterViewTransition(() => {
      for (const filter of collapsed) {
        if (IS_DEV) {
          busDupCheck(filterKeyName(filter));
        }
        // @orb-waive caught-failure-ownership(deps.queryClient.invalidateQueries): refetch failures surface on the queries' own error state; consume the aggregate Promise here.
        deps.queryClient.invalidateQueries(filter).catch(() => undefined);
      }
    });
  };
  return {
    invalidate: (event): void => {
      // Apply BEFORE the invalidate: the refetch this same event fires is what will confirm the row, and
      // between the two the cache must already carry the committed bytes (see `applyCanonView`).
      applyCanonView(deps.queryClient, deps.trpc, event);
      const handler = BUS_FILTERS[event.type] as (e: ChatBusEvent, t: Trpc) => readonly InvalidateFilter[];
      const filters = handler(event, deps.trpc);
      if (IS_DEV) {
        busInvalidate(event.type, event.chatId, filters.map(filterKeyName));
      }
      invalidateFilters(filters);
    },
    invalidateUser: (event): void => {
      const handler = USER_BUS_FILTERS[event.type] as (e: UserBusEvent, t: Trpc) => readonly InvalidateFilter[];
      const filters = handler(event, deps.trpc);
      if (IS_DEV) {
        busInvalidate(event.type, "user", filters.map(filterKeyName));
      }
      invalidateFilters(filters);
    },
    invalidateRpg: (event): void => {
      const handler = RPG_BUS_FILTERS[event.type] as (e: RpgBusEvent, t: Trpc) => readonly InvalidateFilter[];
      const filters = handler(event, deps.trpc);
      if (IS_DEV) {
        busInvalidate(event.type, event.chatId, filters.map(filterKeyName));
      }
      invalidateFilters(filters);
    },
    invalidateAutomation: (event): void => {
      const filters = automationEventFilters(event, deps.trpc);
      if (IS_DEV) {
        busInvalidate(event.type, event.chatId, filters.map(filterKeyName));
      }
      invalidateFilters(filters);
    },
    invalidateAllUserRoots: (): void => {
      invalidateFilters(allUserRootFilters(deps.trpc));
    },
    invalidateIdentity: (): void => {
      invalidateFilters(identityFilters(deps.trpc));
    },
    gapHealRpg: (chatId): void => {
      invalidateFilters(allRpgGameFilters(deps.trpc, chatId));
    },
    gapHealAutomation: (chatId): void => {
      invalidateFilters(allAutomationRoomFilters(chatId, deps.trpc));
    },
    invalidateFilters,
  };
}
