// The named READ SETS the invalidation map's rows compose from, plus the entity→room bridge's per-kind
// rows — split out of `invalidation.ts` (which stays the EVENT→FILTERS maps and the one
// `invalidateFilters` chokepoint) when the bridge's rows pushed that file past the `component-size` cap.
// The seam is real, not arithmetic: a row in the map answers "what does THIS event stale", and a set here
// answers "which reads are that", which is the thing several rows share.
//
// Every export is consumed by `invalidation.ts` alone. Nothing here calls `invalidateQueries` — the seam's
// chokepoint stays in the map file (gate `no-inline-invalidate-outside-seam`).

import type { RoomEntityKind } from "@orb/contracts/chat";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import type { InvalidateQueryFilters } from "@tanstack/react-query";
import { roomRegistry } from "./bus/room-registry.ts";
import type { Trpc } from "./trpc.ts";

/** What the proxy's `.queryFilter()`/`.pathFilter()` return — accepted by `invalidateQueries`. */
export type InvalidateFilter = InvalidateQueryFilters;

// The open chat's CANON reads (no chat list, no `getChat`) — message list, the swipe strip's step-target
// resolver, and the transcript divider's present-tense fit budget (previewContextFit — the boundary moves
// when canon commits/trims, so it refetches on every canon-terminal alongside the list).
//
// `getChat` is DELIBERATELY ABSENT: `ChatDetail` projects the `chats` ROW + roster only (title/star/archived/
// anchor/pendingHost/metadata group·overrides·background·rpg·opening/compact checkpoint/participants — see
// `substrate/chat-detail.ts`), and NOTHING in it derives from canon. Every transition that DOES stale it fires
// its own event, each naming `getChat` explicitly below: `chatUpdated` (title/star/archive/variables/
// injections/roster/handoff AND the auto-compaction checkpoint — the engine emits it on every marker write),
// `personaSwitched`, `chatOpened`, `historyTruncated`, the five `wi*` arms, `chatDeleted`. Carrying it here
// re-fetched the room on every commit/edit/terminal — the measured startChat burst was FOUR `getChat` wire
// fetches in 80ms (two of them from the greeting + user-row `messageCommitted` pair), and a plain turn paid
// two more on commit+complete. `invalidateQueries` does NOT dedupe against an in-flight fetch (it cancels and
// restarts), so every redundant row here is a real round-trip.
//
export function chatCanonReads(trpc: Trpc): readonly InvalidateFilter[] {
  return [
    trpc.chat.listMessages.pathFilter(),
    trpc.chat.listMessageVariants.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
    ...promptPreviewReads(trpc),
  ];
}

// `rpg.revealHidden` is an RPG read with a CANON driver: the verb DERIVES it from the stored selected-variant
// assistant BODIES (`domain/rpg/verbs/read/reveal-hidden.ts` — no table of its own), so its freshness driver
// is a BODY WRITE, not the rpg bus. Without a row the host's veiled cue + Veiled ledger froze at the count
// they had when the panel first mounted (the previewAssembly class — every new GM lie invisible until GC or
// a reload).
//
// It rides the BODY-WRITE terminals ONLY, never `turnCompleted`: a generated turn emits `messageCommitted`
// (the commit that writes the body) and then `turnCompleted` on the very next line of the engine — the second
// event changes no body, so carrying the reveal on both bought a duplicate wire fetch on EVERY turn (and
// `invalidateQueries` does not dedupe against an in-flight fetch — it cancels and restarts it). Every path
// that writes/changes an assistant body does emit `messageCommitted` (engine commit, edit, narrator post,
// generated image, the opening greeting), and the swipe/edit/delete family carries it through `chatReads`,
// so nothing the host can see goes stale. Costs nothing on a non-RPG chat or for a member: `invalidateQueries`
// is a no-op for a key with no cache entry, and the read only mounts for the host of a game.
export function hiddenRevealRead(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.rpg.revealHidden.pathFilter()];
}

// The NEXT TURN'S PROMPT, as the Preview tab shows it: the assembled-prompt trace + the content-free shape
// trace (`features/chat/components/assembly-preview-panel.tsx`). Both were in ZERO map rows, and the
// QueryClient runs `staleTime: Infinity` — so the tab froze at its first fetch FOREVER (the reported "old
// persona still in the preview": the server re-pin was correct, the panel was showing a snapshot from before
// it). They ride the SAME row as `previewContextFit` everywhere — the fit is the budget of exactly this
// assembly, so a row that refetches one and not the other makes the two halves of that tab disagree.
// `previewActionTemplates` (D8 / preset-surface-redesign §7.1) rides HERE, not a row of its own: it is the
// same class of read — a dry-run render of the next turn's prose against the live chat — and it goes stale on
// exactly the same moments. Through this one member it inherits every driver the pair already has:
// `presetsChanged` (the editor's own autosave — the resolved preview must move with the template you just
// typed, which is what makes "settle-live" true here), `settingsChanged` (a model/persona swap changes what
// `{{user}}`/`{{char}}` resolve TO), and every canon terminal (the macros read `{{lastMessage}}` &c). The
// binding's OTHER freshness axis — the bind target moving to a different chat — needs no row at all: `chatId`
// is in the query key, so a switch is a cold fetch of a new key by construction (§4.4's binding rows).
export function promptPreviewReads(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.chat.previewAssembly.pathFilter(), trpc.chat.getShapeTrace.pathFilter(), trpc.chat.previewActionTemplates.pathFilter()];
}

// The room's RUNTIME VARIABLE FOLD (`chat.getRuntimeVariables`) — #16's needle meter is its first client
// consumer. It is a SEPARATE set rather than a line inside `chatCanonReads` because it is not canon and does
// not ride the preview/fit family; it rides the CANON TERMINALS (this is where a turn's `{{setvar}}` delta
// and every automation `set_variable`/analysis-score write land — `chat/engine/engine.ts`,
// `chat/substrate/variable-ops.ts`) and, through `chatReads` below, every event that RE-FOLDS it: a swipe
// selects a different lineage's fold and an edit/delete/reorder re-folds the remaining chain
// (`chat/verbs/edit.ts` — three `runtimeVariablesUpdateStatement` call sites, one per family).
//
// THE FOLD LAGS BY ONE TERMINAL FOR AUTOMATION WRITES, AND THAT IS THE PRICED BEHAVIOUR (spec §3-S5.4:
// "invalidated by the existing turn-commit/swipe chat-bus events"). An automation arm runs in the WATCHER,
// after the commit event has already fanned — so a score written by a fire this event triggered lands after
// the refetch it triggered, and the meter shows it from the next terminal. A tighter driver would cost a new
// member-visible bus member with its full belt/coverage/CHECK price, which the needle's row does not buy.
export function runtimeVariablesRead(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.chat.getRuntimeVariables.pathFilter()];
}

/**
 * Could this tab have MISSED a write to `chatId`'s room since its reads were filled? The room registry keeps
 * the ledger (`liveEpoch`): `1` means the room is on its first live edge of this page load, so the reads that
 * mounted with it ARE the fresh state and there is nothing for an attach-time heal to close (BOOT-4X, stated
 * at room granularity in `bus/room-registry.ts`); `≥2` means it has been dark since — a reconnect, a re-open
 * after a chat switch, or a shed — so a write that landed elsewhere in the meantime is unseen here.
 *
 * `0` (this room never attached in this page) answers HEAL, deliberately: the only callers that can see it
 * are the ones holding an event for a room they never joined — a probe, a story, a unit test of this map —
 * and an over-fire there costs one refetch where an under-fire would silently teach the seam to skip.
 */
export function roomWasDark(chatId: ChatId): boolean {
  return roomRegistry.liveEpoch({ channel: "chat", chatId }) !== 1;
}

/** B6 — the pill row's ONE read (`chat.listReactions`): the room's bounded grouped reaction window, which
 *  the client indexes by `variantId`.
 *
 *  NARROW ON PURPOSE, and this is the same argument the entity→room bridge made for not reusing
 *  `chatUpdated`: `invalidateQueries` CANCELS AND RESTARTS an in-flight fetch, so routing a reaction through
 *  `chatReads` would make every emoji click re-fetch the whole transcript on every attached member's device.
 *  Exactly one query moves, because reactions are deliberately NOT part of `MessageView` — folding them in
 *  would have put a per-variant join on every canon read and every bus view carrier, for an ornament most
 *  rows never carry. */
export function reactionsRead(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.chat.listReactions.pathFilter()];
}

// Canon reads plus the chat list, for non-terminal canon events the server fires no chatsChanged for. Every
// event on this set moves (or can move) a stored body — an edit, a swipe, a hide, a delete/reorder — so the
// host-reveal derivation rides with it.
export function chatReads(trpc: Trpc): readonly InvalidateFilter[] {
  return [...chatCanonReads(trpc), ...hiddenRevealRead(trpc), ...runtimeVariablesRead(trpc), trpc.chat.listChats.pathFilter()];
}

/** Per-entity-kind filters for `roomEntityChanged`. Total over `RoomEntityKind` (the mapped type is the
 *  belt). Every row is free when its surface is closed — `invalidateQueries` is a no-op for a key with no
 *  cache entry. */
export const ROOM_ENTITY_FILTERS: { readonly [K in RoomEntityKind]: (chatId: ChatId, trpc: Trpc) => readonly InvalidateFilter[] } = {
  // The D22 member-card dialog (`getMemberCard`) is THE row the owner's symptom was missing: a card edit
  // fanned to the room repainted `getChat` and nothing else, because `getMemberCard` rode only the
  // editor-local user-bus `charactersChanged` row. Plus the seat's name/avatar in the roster (`getChat`) and
  // the member-gated fit budget + previews, which the card's content feeds.
  character: (chatId, trpc) => [
    trpc.chat.getMemberCard.pathFilter(),
    trpc.chat.getChat.queryFilter({ chatId }),
    trpc.chat.previewContextFit.pathFilter(),
    ...promptPreviewReads(trpc),
  ],
  // A human seat's member-visible displayName + avatar ARE their active persona's (the server's
  // `resolveUserPublics`), so roster identity moves; the description feeds the next turn's assembly.
  persona: (chatId, trpc) => [trpc.chat.getChat.queryFilter({ chatId }), trpc.chat.previewContextFit.pathFilter(), ...promptPreviewReads(trpc)],
  // ASSEMBLY-derived reads only. No `worldInfo.*` row: those reads are OWNER-scoped, so a member never holds
  // a cache entry for them, and the owner's own devices already ride the user-bus `worldInfoChanged`.
  "world-info": (_chatId, trpc) => [trpc.chat.previewContextFit.pathFilter(), ...promptPreviewReads(trpc)],
  // #1733/#1742 — the room's regex. THREE reads and no more: the member-readable room rack
  // (`regex.listForChat`, room-public), the HOST's effective read (the section's whole body, host-gated), and
  // the assembly-derived family every tier change moves (the host-tier union feeds the prompt, and the
  // `PROMPT_HISTORY` leg runs inside the preview build). No `regex.listScripts`/`listGlobal` row: those are
  // OWNER-scoped, so a member holds no cache entry for them and the owner's own devices already ride the
  // user-bus `regexChanged`. Deliberately NOT `chatReads`: a regex change moves no message body, and
  // `invalidateQueries` cancels+restarts in-flight fetches (the entity→room bridge's own argument).
  regex: (chatId, trpc) => [
    trpc.regex.listForChat.queryFilter({ chatId }),
    trpc.chat.listEffectiveRegex.queryFilter({ chatId }),
    trpc.chat.previewContextFit.pathFilter(),
    ...promptPreviewReads(trpc),
  ],
};

// ── THE RPG BUS's event→filter map ──────────────────────────────────────────────────────────────────────
// It lives HERE, beside `ROOM_ENTITY_FILTERS` (the other per-member dispatch Record) rather than inside
// `invalidation.ts`, for one structural reason: that file sits AT the 450-line component cap, and this map is
// the one self-contained third of it — its own event union, its own router namespace, its own gap-heal set,
// and zero references from the chat/user maps. The seam is unchanged; `invalidation.ts` imports these two
// names. Its behavioral pins stay in `tests/client/data/invalidation.test.ts`, which drives them through
// `invalidateRpg`/`gapHealRpg` — the surface a reader cares about — not through the map object.
//
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

export const RPG_BUS_FILTERS: RpgBusFilterMap = {
  // The game row itself changed (create/config/knob/mode) — the takeover mode read + the host editor refetch.
  // `revealHidden` rides along: the reveal-eye knob (`config.features.hiddenContentReveal`) makes the verb return the
  // EMPTY reveal, so flipping it must empty/refill the host's veiled surfaces immediately.
  gameChanged: (e, trpc) => [
    trpc.rpg.getGame.queryFilter({ chatId: e.chatId }),
    trpc.rpg.getConfigView.queryFilter({ chatId: e.chatId }),
    trpc.rpg.revealHidden.queryFilter({ chatId: e.chatId }),
    // `gmPresetId` is one of the knobs this event covers, and it is the ONLY per-room preset binding — so
    // the Presets CONTEXT panel's "used by" roster (`preset.listUsage`) goes stale on exactly this write.
    // A path filter, not a keyed one: the reader is looking at some OTHER surface's preset, not this room's.
    trpc.preset.listUsage.pathFilter(),
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
  // Lifecycle-only: the rpg-round store consumes these in `use-rpg-bus`; no durable read changed yet.
  stateRoundStarted: () => [],
  stateRoundSettled: () => [],
  // A folded turn's tool-call record landed — the per-row "what this turn did" disclosure refetches
  // (TOOLCALLS-INVISIBLE, arm A). Query-level (one chat): the read is chat-scoped and unpaged.
  turnToolCallsRecorded: (e, trpc) => [trpc.rpg.listTurnToolCalls.queryFilter({ chatId: e.chatId })],
};

/** Every rpg filter, for the (re)connect gap-heal (the `use-rpg-bus.ts` blanket invalidate) — the game +
 *  tracker + config + journal + host-reveal reads for one open game, derived so a new read can't drift the
 *  heal set. */
export function allRpgGameFilters(trpc: Trpc, chatId: ChatId): readonly InvalidateFilter[] {
  return [
    trpc.rpg.getGame.queryFilter({ chatId }),
    trpc.rpg.getTrackerView.queryFilter({ chatId }),
    trpc.rpg.getConfigView.queryFilter({ chatId }),
    trpc.rpg.listJournal.pathFilter(),
    trpc.rpg.revealHidden.queryFilter({ chatId }),
    trpc.rpg.listTurnToolCalls.queryFilter({ chatId }),
  ];
}
