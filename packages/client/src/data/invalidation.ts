// Central invalidation seam: bus handlers call invalidate(event)/invalidateUser(event), mutations
// route `invalidates` filters through invalidateFilters — nothing else calls invalidateQueries
// directly (gate `no-inline-invalidate-outside-seam`).
//
// The chat half ALSO APPLIES the event's `view` carrier into the room's message-list cache before it
// invalidates (`applyCanonView`) — the refetch stays, but the row it will confirm is already correct.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { USER_BUS_EVENT_TYPES } from "@orb/contracts/user-bus";
import type { ChatId } from "@orb/kit/ids";
import type { QueryClient } from "@tanstack/react-query";
import { busDupCheck, busInvalidate, IS_DEV } from "#lib";
import { collapseFilters } from "./collapse-filters.ts";
import { applyCanonView } from "./invalidation-carrier.ts";
import type { InvalidateFilter } from "./invalidation-reads.ts";
import { chatCanonReads, chatReads, hiddenRevealRead, promptPreviewReads, ROOM_ENTITY_FILTERS } from "./invalidation-reads.ts";
import type { Trpc } from "./trpc.ts";

export type { InvalidateFilter } from "./invalidation-reads.ts";

/** The tRPC filter's dotted path — the readable key name the `[bus]` dev log keys off. Dev-only. */
function filterKeyName(filter: InvalidateFilter): string {
  const queryKey = (filter as { readonly queryKey?: readonly unknown[] }).queryKey;
  const path = Array.isArray(queryKey) ? queryKey[0] : undefined;
  return Array.isArray(path) ? path.join(".") : "?";
}

export interface Invalidation {
  /** The bus half — routes a `ChatBusEvent` through the exhaustive map. Fire-and-forget. */
  readonly invalidate: (event: ChatBusEvent) => void;
  /** The user-bus half — routes a `UserBusEvent` through `USER_BUS_FILTERS`. Fire-and-forget. */
  readonly invalidateUser: (event: UserBusEvent) => void;
  /** The rpg-bus half — routes an `RpgBusEvent` through `RPG_BUS_FILTERS` (the feature-root game bus,
   *  `rpg.stream`). Fire-and-forget. */
  readonly invalidateRpg: (event: RpgBusEvent) => void;
  /** Gap-heal — on rpg-bus (re)connect for an open game, blanket-invalidate every read that game covers. */
  readonly gapHealRpg: (chatId: ChatId) => void;
  /** Gap-heal — on user-bus RE-connect, blanket-invalidate every filter the user map covers. Never on the
   *  first connect of a page load: that mount's own reads ARE the fresh state (`use-user-bus.ts`). */
  readonly invalidateAllUserRoots: () => void;
  /** The IDENTITY reads — `sessions.me` plus the two composites `use-viewer.ts` derives the viewer from.
   *  Called by the session-recovery ladder's resume rung, which has NO event to route: a tab that just
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
  warning: nothing,
  worldInfoActivated: nothing,

  // Canon-terminal commit — the open chat's canon only; the chat list/character-library recency is
  // driven by the user-bus chatsChanged fan on this same moment (avoids a triple-invalidate).
  messageCommitted: (_e, trpc) => [...chatCanonReads(trpc), ...hiddenRevealRead(trpc)],
  messageEdited: (_e, trpc) => chatReads(trpc),
  messageHidden: (_e, trpc) => chatReads(trpc),
  variantSelected: (_e, trpc) => chatReads(trpc),
  messagesDeleted: (_e, trpc) => chatReads(trpc),
  messagesReordered: (_e, trpc) => chatReads(trpc),
  reasoningEdited: (_e, trpc) => chatReads(trpc),
  reasoningCleared: (_e, trpc) => chatReads(trpc),

  turnCompleted: (_e, trpc) => chatCanonReads(trpc),
  turnAborted: (_e, trpc) => chatReads(trpc),

  // A re-anchored persona rewrites `{{user}}` (and the persona block) in the NEXT turn's prompt — the room
  // read AND the prompt preview.
  personaSwitched: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],

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
  // Widened with `getMemberCard` as the LIVE-ONLY LANE'S HEAL (the entity→room bridge §3.4/§3.7): a
  // `roomEntityChanged` is never replayed, so a device that was dark through a card edit learns about it on
  // its next attach — and `chatOpened` re-fires on EVERY (re)attach (reopen, reconnect, shed-restart), which
  // is exactly the moment that gap closes. Free when the dialog is shut: the read is `enabled: open`, so
  // there is no cache entry and `invalidateQueries` is a no-op. Deliberately NOT widened with the fit/preview
  // reads — those would re-pay a BOOT-4X-class fetch on every room open, and their staleness bound is one
  // turn (the next canon terminal refetches them through the durable replay).
  chatOpened: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId }), trpc.chat.getMemberCard.pathFilter()],
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
    trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
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

// Second map: the per-user bus. staleTime: Infinity means only a bus tick refetches a non-chat
// domain read; this is the freshness driver for every surface the chat bus doesn't reach. Coarse by
// design — each member path-invalidates its whole domain root.
type UserBusFilterMap = {
  readonly [K in UserBusEvent["type"]]: (event: Extract<UserBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const USER_BUS_FILTERS: UserBusFilterMap = {
  // `chat.getMemberCard` is a CHAT-scoped projection of a character card (host-owned, clamped by the room's
  // memberCardVisibility) — a card edit is announced HERE, not on the chat bus, so without this row the member-
  // card dialog re-opened inside its gcTime window showed the pre-edit card. Path-level and free when the
  // dialog is closed (the read is `enabled: open`, so there is no cache entry to refetch).
  // + the regex attached-by rosters: a character RENAME must repaint its name in listScriptUsage
  // (REGROSTER's flagged gap — attach/detach ride regexChanged; renames ride only this event).
  charactersChanged: (_e, trpc) => [trpc.character.pathFilter(), trpc.chat.getMemberCard.pathFilter(), trpc.regex.listScriptUsage.pathFilter()],
  personasChanged: (_e, trpc) => [trpc.persona.pathFilter()],
  // A preset edit changes the effective params (maxOutput/maxContext) the fit reserves against, so the
  // transcript divider's budget must refetch too (the boundary tracks knob changes live, PD-#7) — and the
  // preset OWNS the prompt's section order/content, so the prompt preview is stale on the same edit.
  // `getUserMacroPicks`/`getVariablePicks` ride a preset edit too: their DECLARATIONS halves ARE the active
  // preset's `userMacros`/`variables` (adding/removing a macro input or a ChoiceBlock changes which controls
  // the picks pane must render), and no chat-bus event fires when the preset — a different domain's row — is
  // edited. The preset ROOT filter also carries `resolveEffective`: every knob autosave, reset, import and
  // fork-COW emits this event, and re-resolving the funnel on save-settle is what makes the deck's effective
  // column TRUE rather than a snapshot (redesign §4.4).
  presetsChanged: (_e, trpc) => [
    trpc.preset.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
    trpc.chat.getUserMacroPicks.pathFilter(),
    trpc.chat.getVariablePicks.pathFilter(),
    ...promptPreviewReads(trpc),
    // The regex attached-by roster names a preset by display name — a rename repaints here.
    trpc.regex.listScriptUsage.pathFilter(),
  ],
  worldInfoChanged: (_e, trpc) => [trpc.worldInfo.pathFilter()],
  regexChanged: (_e, trpc) => [trpc.regex.pathFilter()],
  tagsChanged: (_e, trpc) => [trpc.tag.pathFilter()],
  // Themes live under the settings router but are a distinct read surface.
  themesChanged: (_e, trpc) => [trpc.settings.listThemes.pathFilter(), trpc.settings.getTheme.pathFilter()],
  // User settings only — not the app/global settings. Routing/roleDefaults changes re-resolve the chat
  // capability (the fit window), so the divider's budget refetches with the settings read — and so does
  // `connection.resolveChatCapability`, the read the preset params panel gates its sampling/reasoning/output
  // axes on (Connections writes roleDefaults through `settings.updateUserSettingsSection`, which is
  // busDriven — without this row, picking a chat model left the editor on its connect-a-model note until a
  // full page reload). Narrow filter, not the connection ROOT: the catalog reads under it are cold-fetch
  // expensive and no roleDefaults edit changes them.
  settingsChanged: (_e, trpc) => [
    trpc.settings.getUserSettings.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
    trpc.connection.resolveChatCapability.pathFilter(),
    // `preset.resolveEffective` is the funnel projected AGAINST that capability, and its readout names the
    // model ("resolved for <model>"). A routing/model change that refetched the capability but not this read
    // would leave every provenance line — `model default`, `clamped to 1.2` — describing the OLD model.
    // Narrow, not the preset root: the preset ROWS did not change, and `presetsChanged` already covers those.
    trpc.preset.resolveEffective.pathFilter(),
    // The same settings feed the ASSEMBLY the fit measures (chat behavior, the resolved model/capability the
    // shaper builds against) — the preview must move with the budget, never lag a knob behind it.
    ...promptPreviewReads(trpc),
  ],
  credentialsChanged: (_e, trpc) => [trpc.credentials.pathFilter()],
  // The chat-list + character-library recency driver, and the sole driver on the message-commit
  // terminal path (the server fans this to every present member on both canon-commit terminals and
  // chat-list lifecycle ops). chatId present (lifecycle) also refetches that chat's getChat.
  //
  // `trpc.stats.pathFilter()` (the ROUTER ROOT — all twelve Analytics reads) rides here: turn ECONOMICS is
  // written into the `owner_stats`/`character_stats` rollups inside the SAME db.batch as the canon write
  // (`ctx.applyStatsDelta`, `domain/chat/substrate/stats-delta.ts`), and this fan is the moment that batch
  // lands. Without it the twelve reads had NO driver at all: an open Analytics route froze at mount, and a
  // re-open inside gcTime served numbers up to 5 min old (the previewAssembly class).
  //
  // The cost objection that deferred this row is bounded by how `invalidateQueries` works: it REFETCHES only
  // ACTIVE queries and merely MARKS inactive ones stale. Every stats consumer lives in `features/stats`
  // (the Analytics section), and `SectionContent` hides an inactive section with `<Activity mode="hidden">`
  // — which tears down effects, so the observers unsubscribe. So a commit costs wire fetches ONLY while the
  // dashboard is the VISIBLE section (where live numbers are the point); everywhere else it costs exactly
  // one stale mark, which is what makes the next open correct. The reads are `owner_stats` rollup SELECTs,
  // not scans (`domain/stats/persistence/rollups.ts`).
  //
  // Two honest residuals, over- and under-fire, both accepted: a chat rename/star fans this with no stats
  // change (a spare stale mark), and a CHATLESS image generation (`imagery.editImage` with no `chatId`) does
  // write cost stats with no chat event — that dashboard catches up on the next chat activity. Closing the
  // latter needs a stats-grain producer event, not a wider chat one.
  chatsChanged: (e, trpc) =>
    e.chatId === undefined
      ? [trpc.chat.listChats.pathFilter(), trpc.character.list.pathFilter(), trpc.stats.pathFilter()]
      : [trpc.chat.listChats.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), trpc.character.list.pathFilter(), trpc.stats.pathFilter()],
  // The refinery workspace — the whole router root (roster · session view · run ledger · schema library ·
  // preflight): the member is coarse by design, every one of those reads moves on some write, and the
  // surface never has more than one session open, so a narrower map would be five rows for one refetch.
  //
  // `character.get` rides here, and it is the non-obvious row: a score/analyze run rewrites
  // `characters.refinery.score`/`.analysis` through the F6 stamp op, which is SILENT BY DESIGN (no audit,
  // no user-bus event — `character/persistence/refinery-ops.ts`). That is exactly what the card's
  // provenance readout renders, so without this row the readout has no driver at all once the write tier
  // stopped naming it (the R2 hooks are busDriven now). Narrow, not the character ROOT: the library list
  // did not change — a refinery run touches derived signals on ONE card, and `charactersChanged` already
  // covers everything that moves the roster.
  refineryChanged: (_e, trpc) => [trpc.refinery.pathFilter(), trpc.character.get.pathFilter()],
  // The document bank — the whole router root (library list · one document's detail · the global id set ·
  // the "Active in" attachment chips · the per-chat rack). Coarse on purpose: every databank write moves at
  // least two of those reads, and the previous alternative was nine mutations each hand-naming its own
  // subset (event-bus coverage survey H3). The `documentId` hint is deliberately UNUSED here — a root
  // path-invalidate is what the surface needs and it costs one refetch either way.
  //
  // Note what this row does NOT do: repaint the chat rack for a NON-owner participant. A user-bus event
  // reaches one user's channel by construction, so the host's attach repaints the host; the room's view of
  // what feeds its prompts is member-visible state and rides `chatUpdated` on the chat bus (see
  // `BUS_FILTERS`, and `membership-fan-guard` for why widening this member would be the wrong fix).
  databankChanged: (_e, trpc) => [trpc.databank.pathFilter()],
  // The corpus analytics — the discovery ROOT (all 27 dashboard reads) plus `search.similarArt`, which lives
  // under the search router but is pure image-vector cosine written by the same passes. These reads had NO
  // driver of any kind: their writers are background workloads, so there was never a mutation to hang an
  // `invalidates` on, and at `staleTime: Infinity` a mounted Corpus route froze until gcTime evicted it.
  //
  // NOT the search ROOT: `search.search`/`fields`/`suggest` are input-keyed live queries whose key IS the
  // query text, so every ask is already a cold fetch of a new entry — invalidating them on a recompute
  // would re-run someone's typed search for no freshness gain.
  corpusRecomputed: (_e, trpc) => [trpc.discovery.pathFilter(), trpc.search.similarArt.pathFilter()],
  // The VIEWER'S OWN identity, through the one `identityFilters` helper the recovery ladder also calls (W7b).
  // Closes the staleness design's D5 gap: `sessions.me` had NO bus driver, so an `admin.setRole` grant — or an
  // SSO login elsewhere that renamed the handle / re-derived the role — reached a live client only on a full
  // reload, which at `staleTime: Infinity` may never come. It joins the reconnect gap-heal by DERIVATION, and
  // that half matters most here: the write happens on somebody ELSE'S request, so a device that was offline
  // for the grant has no local signal at all. NOT `admin.listUsers`/`listSessions` — those are the ACTING
  // admin's reads (writer-local, per their own cited `query-freshness-coverage` entries); this member only
  // ever reaches the AFFECTED user's channel.
  identityChanged: (_e, trpc) => identityFilters(trpc),
  // Deferred member — never emitted today; the map entry is ready for when it lands.
  connectionsChanged: (_e, trpc) => [trpc.connection.pathFilter()],
};

// Third map: the feature-root rpg game bus (`rpg.stream`). LIVE-ONLY like the user bus; the client's tracker/
// journal reads run `staleTime: Infinity`, so an rpg-bus tick is their freshness driver. TOTAL over
// `RpgBusEvent["type"]` (the mapped type below is `bus-definition-belts`' consumer-exhaustiveness belt — a new
// member fails tsc here until it names its reads). SWIPE freshness rides the CHAT bus (`variantSelected`, in
// `BUS_FILTERS`), NOT a new rpg event — nothing is written on swipe-select, so the rpg bus never announces it.
//
// W2 FORWARD-SEAM: the rpg VERB tRPC procs (`trpc.rpg.getTrackerView`/`getGame`/`listJournal`/`getConfigView`)
// land with the W2 rpg router — they do NOT exist on `AppRouter` yet, so each handler returns `[]` for now
// (the map's SHAPE is the belt G11 checks; the real `trpc.rpg.*` filters wire in W2 alongside the stream hook).
// The per-member notes name the read each will invalidate — the same "map ready, procs pending" posture the
// user bus's `connectionsChanged` deferral takes.
type RpgBusFilterMap = {
  readonly [K in RpgBusEvent["type"]]: (event: Extract<RpgBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const RPG_BUS_FILTERS: RpgBusFilterMap = {
  // The game row itself changed (create/config/knob/mode) — the takeover mode read + the host editor refetch.
  // `revealHidden` rides along: the M4 knob (`config.features.hiddenContentReveal`) makes the verb return the
  // EMPTY reveal, so flipping it must empty/refill the host's veiled surfaces immediately.
  gameChanged: (e, trpc) => [
    trpc.rpg.getGame.queryFilter({ chatId: e.chatId }),
    trpc.rpg.getConfigView.queryFilter({ chatId: e.chatId }),
    trpc.rpg.revealHidden.queryFilter({ chatId: e.chatId }),
  ],
  // A swipe-volatile snapshot was written — the WHOLE panel re-resolves against the new resolved-current
  // snapshot (§4.9), so the single tracker aggregate refetches (every tab reads it).
  snapshotPatched: (e, trpc) => [trpc.rpg.getTrackerView.queryFilter({ chatId: e.chatId })],
  // A per-actor identity sheet changed — the Status/Sheet tabs ride the same tracker aggregate.
  sheetChanged: (e, trpc) => [trpc.rpg.getTrackerView.queryFilter({ chatId: e.chatId })],
  // The snapshot-resident quest plane changed — the Scene tab's goal lines ride the tracker aggregate.
  questChanged: (e, trpc) => [trpc.rpg.getTrackerView.queryFilter({ chatId: e.chatId })],
  // A journal entry landed/changed — the paged, lineage-filtered archive refetches (Journal is full-only,
  // but the listJournal read still invalidates for parity + the future lite→full graduation). Path-level (all
  // pages) — the read is paged, so a page-keyed queryFilter would miss the other pages.
  journalChanged: (_e, trpc) => [trpc.rpg.listJournal.pathFilter()],
  // A folded turn's tool-call record landed — the per-row "what this turn did" disclosure refetches
  // (TOOLCALLS-INVISIBLE, arm A). Query-level (one chat): the read is chat-scoped and unpaged.
  turnToolCallsRecorded: (e, trpc) => [trpc.rpg.listTurnToolCalls.queryFilter({ chatId: e.chatId })],
};

/** Every rpg filter, for the (re)connect gap-heal (the `use-rpg-bus.ts` blanket invalidate) — the game +
 *  tracker + config + journal + host-reveal reads for one open game, derived so a new read can't drift the
 *  heal set. */
function allRpgGameFilters(trpc: Trpc, chatId: ChatId): readonly InvalidateFilter[] {
  return [
    trpc.rpg.getGame.queryFilter({ chatId }),
    trpc.rpg.getTrackerView.queryFilter({ chatId }),
    trpc.rpg.getConfigView.queryFilter({ chatId }),
    trpc.rpg.listJournal.pathFilter(),
    trpc.rpg.revealHidden.queryFilter({ chatId }),
    trpc.rpg.listTurnToolCalls.queryFilter({ chatId }),
  ];
}

/** The viewer triple (`use-viewer.ts`): the server identity plus the two reads its `currentPersona`
 *  derivation composes. TWO callers share this ONE spelling — the `identityChanged` row above (the
 *  cross-device driver; W7b retired this docblock's old "the map has NO identity member" note) and
 *  `invalidateIdentity()` below, the recovery ladder's rung that fires with no event at all. */
function identityFilters(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.sessions.me.pathFilter(), trpc.settings.getUserSettings.pathFilter(), trpc.persona.list.pathFilter()];
}

/** Every filter the user map covers — derived so a new member can't drift the gap-heal set. */
function allUserRootFilters(trpc: Trpc): readonly InvalidateFilter[] {
  return (Object.keys(USER_BUS_EVENT_TYPES) as UserBusEvent["type"][]).flatMap((type) => {
    const handler = USER_BUS_FILTERS[type] as (e: UserBusEvent, t: Trpc) => readonly InvalidateFilter[];
    return handler({ type } as UserBusEvent, trpc);
  });
}

export function createInvalidation(deps: { readonly queryClient: QueryClient; readonly trpc: Trpc }): Invalidation {
  const invalidateFilters = (filters: readonly InvalidateFilter[]): void => {
    for (const filter of collapseFilters(filters)) {
      if (IS_DEV) {
        busDupCheck(filterKeyName(filter));
      }
      // Fire-and-forget by design: refetch failures surface on the queries' own error state.
      void deps.queryClient.invalidateQueries(filter);
    }
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
    invalidateAllUserRoots: (): void => {
      invalidateFilters(allUserRootFilters(deps.trpc));
    },
    invalidateIdentity: (): void => {
      invalidateFilters(identityFilters(deps.trpc));
    },
    gapHealRpg: (chatId): void => {
      invalidateFilters(allRpgGameFilters(deps.trpc, chatId));
    },
    invalidateFilters,
  };
}
