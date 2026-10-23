// Live-only game events scope client invalidation to a chat; reconnects reconcile missed updates.
// The discriminator tuple also validates bus events in the production trace parser.
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

/** Event names accepted by the trace parser and checked against the live event union. */
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

/** Injected post-commit publication; composition owns the live bus instance. */
export type EmitRpgEvent = (event: RpgBusEvent) => void;
