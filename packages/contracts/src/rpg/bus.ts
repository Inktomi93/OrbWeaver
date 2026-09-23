// @orb/contracts/rpg/bus — the feature-root rpg bus event union + its producer-coverage belt.
// A cross-boundary TYPE only; the RUNTIME (the live replay-less singleton) is `domain/rpg/bus.ts`, the
// transport is the `rpg.stream` subscription, and the consumer belt is the client `EVENT_INVALIDATIONS` total
// map (`data/invalidation.ts`). The bus is LIVE-ONLY, self-healing — it MIRRORS the per-user
// `user-events-bus.ts` (NOT the durable chat bus): nothing durable rides it (queries re-fetch), a subscriber
// attaches and goes live, and the client gap-heals every (re)connect with a blanket invalidate. Every event
// carries `chatId` so the client scopes its invalidation to the open game.
//
// WHY a feature bus, not new chat-bus members: the chat bus vocabulary is frozen-ish public surface with a
// 5-site coupling cost per member and D19/D50 allowlist constraints; game events are feature-scoped, and the
// feature bus is the D70 event-spine tier for exactly this (client-architecture-state-and-gates.md §13).
//
// SWIPE INVALIDATION RIDES THE CHAT BUS, NOT a new rpg event (the ratification consequence, §4.9): a swipe
// emits chat's existing `variantSelected`; the server writes NOTHING on swipe-select (the snapshot plane +
// the lineage projection are both derived from the selected-variant pointer), so there is nothing for the rpg
// bus to announce. The client's tracker/journal invalidation keys list `variantSelected` alongside these.
//
// D72 MACHINE-SHIPS-WITH-ITS-SEAL: a NEW member is gated on BOTH ends — the PRODUCER side by
// `tooling/src/verify/gates/bus-producer-coverage.ts` (every member of every belted bus needs a server emit
// site — a declared-never-emitted member is RED, not silent dead wire, D50), and the CONSUMER
// side by the exhaustive `EVENT_INVALIDATIONS` mapped Record over `RpgBusEvent["type"]` (a new member fails
// client tsc until it names its reads; `bus-definition-belts` checks BOTH belts exist). `RPG_BUS_EVENT_TYPES`
// below is the string mirror the coverage gate reads.
//
// Full ADDS its members additively (`clockChanged`/`checkResolved`/`encounterStarted`/… + the `hostOnly` emit
// option) — the graft map (§C). No `hostOnly` machinery in v1 (lite has no hidden ring).

import type { ChatId, ChatTurnId, RpgJournalId, RpgSheetId, RpgSnapshotId } from "@orb/kit/ids";

/** One rpg-game live event — a coarse "this plane changed, re-resolve" signal scoped to a game's `chatId`.
 *  The optional entity id is a targeting HINT; the client map is free to path-invalidate the whole panel
 *  regardless (a missed id costs one broader refetch; invalidation is idempotent). LIVE-ONLY — a dropped
 *  tick is healed by the client's reconnect blanket invalidate. */
export type RpgBusEvent =
  /** The game row itself changed (create, config/knob write, mode) — the takeover + config reads refetch. */
  | { type: "gameChanged"; chatId: ChatId }
  /** A swipe-volatile snapshot was written (tool/extraction flush, hand edit, checkpoint restore) — the whole
   *  tracker panel re-resolves against the new resolved-current snapshot. */
  | { type: "snapshotPatched"; chatId: ChatId; snapshotId: RpgSnapshotId }
  /** A per-actor identity sheet changed (`patchSheet`) — the Status/Sheet tabs refetch. */
  | { type: "sheetChanged"; chatId: ChatId; sheetId: RpgSheetId }
  /** The snapshot-resident quest plane changed (`upsertQuest`/`deleteQuest`, or a tool flip) — the Quests tab
   *  refetches. Rides `snapshotPatched` semantics but is a distinct signal so a quests-only surface can scope. */
  | { type: "questChanged"; chatId: ChatId }
  /** A journal entry landed/changed (`addJournalEntry`-family or a staged flush) — the paged Journal refetches. */
  | { type: "journalChanged"; chatId: ChatId; journalId?: RpgJournalId }
  /** The asynchronous post-commit state vehicle started/settled. Unlike the durable plane events, these two
   *  carry no invalidation: they keep the freshness surface honest during the gap after narrative streaming
   *  ends but before the RPG flush writes and announces its rows. `turnId` makes overlapping rounds a set,
   *  never a boolean where one completion can hide another live round. */
  | { type: "stateRoundStarted"; chatId: ChatId; turnId: ChatTurnId }
  | { type: "stateRoundSettled"; chatId: ChatId; turnId: ChatTurnId }
  /** A folded turn's tool-call RECORD landed (TOOLCALLS-INVISIBLE, arm A) — the per-row "what this turn did"
   *  disclosure refetches.
   *
   *  ITS OWN MEMBER RATHER THAN RIDING `snapshotPatched`, and the reason is the whole point of the feature: a
   *  turn whose calls ALL dropped writes a record and NO snapshot, so `snapshotPatched` never fires for it —
   *  and that is precisely the turn a user is asking "why did nothing happen?" about. Keying the disclosure to
   *  the snapshot event would leave the failing case stale until an unrelated later turn happened to write
   *  state. This member fires on every recorded turn, both arms. */
  | { type: "turnToolCallsRecorded"; chatId: ChatId };

/** The producer-coverage belt (§4.9, coupled site): every `RpgBusEvent` discriminant, enumerated. The
 *  `satisfies readonly RpgBusEvent["type"][]` proves each member is a real event type (a typo fails tsc); the
 *  reverse — a NEW union member missing here — surfaces via `tooling/src/verify/gates/bus-producer-coverage.ts`,
 *  which reads THIS list to know the members it must find a producer emit for. The client
 *  invalidation map keys on the same union. */
export const RPG_BUS_EVENT_TYPES = [
  "gameChanged",
  "snapshotPatched",
  "sheetChanged",
  "questChanged",
  "journalChanged",
  "stateRoundStarted",
  "stateRoundSettled",
  "turnToolCallsRecorded",
] as const satisfies readonly RpgBusEvent["type"][];
export type RpgBusEventType = (typeof RPG_BUS_EVENT_TYPES)[number];

/** The INJECTED emit op the rpg verbs/flush close over (the house cross-feature-op pattern — the domain
 *  declares this TYPE, the entry root wires the runtime to `domain/rpg/bus.ts`'s `publishRpgEvent`). Fire-and-
 *  forget (`void`) — LIVE-ONLY, so a dead live path costs at most a stale read the next reconnect heals;
 *  called AFTER a durable write commits. All five members are WIRED (W1c-b): the compose-injected `emitBus`
 *  (→ `domain/rpg/bus.ts` `publishRpgEvent`) fires from the verbs/flush — `bus-producer-coverage` holds it. */
export type EmitRpgEvent = (event: RpgBusEvent) => void;
