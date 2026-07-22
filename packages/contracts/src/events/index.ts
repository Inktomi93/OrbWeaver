// @orb/contracts/events — the in-process domain-event bus payload union. The event-bus SHAPE is decided
// (DECISIONS-LEDGER §"deferred" → in-process typed bus; the payload shapes live HERE; the bus instance +
// subscriptions are wired at `entry/compose/event-bus.ts` when the first subscriber lands). The embeddings
// `indexer/` is the subscriber; `character`/`import` emit `character.updated`, `assets` emits
// `asset.created`. Kit-only (zod + `@orb/kit/ids` brands; no domain, no `@orb/db`, no sibling contracts).
//
// The injection model (domain-no-cross-feature): an emitting domain NEVER reaches the bus directly — it
// receives the injected `EmitDomainEvent` op (wired at the composition root) and the indexer's handlers are
// typed against `DomainEvent`. CLOSED union: credentials/secrets are type-level unrepresentable here (a
// payload is only a branded id — the subscriber re-reads canon by id, never trusting event-carried data).

import type {
  AssetId,
  CardEvolutionProposalId,
  CharacterId,
  ChatId,
  CrewEditProposalId,
  RpgClockId,
  RpgEncounterId,
  RpgNpcId,
  RpgSessionId,
} from "@orb/kit/ids";

// The discriminant axis (§7.5 one-union; a new event = a member here + a handler, nowhere else). The four
// `crew.*` members are the chat-crew domain-event MIRROR (chat-crew-design/04 §4): a curated, id-only subset
// of `CrewBusEvent` that a crew applier emits so D46 Tier-1 automation can trigger on crew activity. Their
// SPELLINGS are pinned by the landed `DOMAIN_TRIGGER_TYPES` reservation (`@orb/contracts/automation`) — this
// flip is what arms those reserved triggers. The emit sites land with each applier (CW2–CW5); CW1 lands the
// type-level mirror + the indexer's no-op arms so the closed-union dispatch stays exhaustive. The five `rpg.*`
// members are the rpg domain-event MIRROR (rpg-design/05 §5 / 09b — R5): the curated `RpgBusEvent` subset the
// rpg verbs mirror here so automation triggers on game activity (`rpg.encounterEnded` is a PENDING EMITTER
// until R8; the other four emit at their landed producer verbs — R5 also lands the indexer's no-op arms).
export const DOMAIN_EVENT_TYPES = [
  "character.updated",
  "asset.created",
  "crew.keeperRan",
  "crew.editProposalCreated",
  "crew.cardProposalCreated",
  "crew.directorPassCompleted",
  "rpg.clockCompleted",
  "rpg.sessionConcluded",
  "rpg.encounterEnded",
  "rpg.reputationMilestone",
  "rpg.checkResolved",
] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/** A character card was created/edited — the indexer re-embeds the card (`store(kind='card', lens='card-text')`).
 *  `contentChanged` discriminates a real CONTENT write (create/import/restore, or an `update` that changed a
 *  card field) from an identity-FLAG-only edit (star/archive/trustHtml/theme — `card-merge.ts:flagEdits`): the
 *  embeddings indexer re-embeds ONLY when `contentChanged` is true, so toggling a star never touches the model
 *  (owner ruling — starring is not a content change, backfill belongs to content events + the PD-53 sweep). The
 *  field is ADDITIVE: the multi-human chat-bus fan (`emit-character-updated.ts`) ignores it and fires on EVERY
 *  edit (a co-member's open room must hear a theme/flag change too — a different consumer with a different need). */
export interface CharacterUpdatedEvent {
  readonly type: "character.updated";
  readonly characterId: CharacterId;
  readonly contentChanged: boolean;
}

/** An avatar asset was stored — the indexer embeds BOTH image lenses (`image-raw` + `image-captioned`). */
export interface AssetCreatedEvent {
  readonly type: "asset.created";
  readonly assetId: AssetId;
}

// ── chat-crew domain-event mirror (chat-crew-design/04 §4) ──────────────────────────────────────────────
// Id-only per D38: an automation consumer re-reads canon by the branded id, never trusting event-carried
// data. `chatId` is the scope key every crew artifact reaches its authority through (chats are membership-
// scoped, D18). The embeddings indexer ignores all four (they touch no embeddable canon).

/** The lorebook keeper committed a run.
 *  PENDING EMITTER: no emit site in CW1 — it lands with `applyKeeperResult` (CW2). The member exists here now
 *  only to arm automation's reserved `crew.keeperRan` trigger (no coverage gate watches DOMAIN_EVENT emitters). */
export interface CrewKeeperRanEvent {
  readonly type: "crew.keeperRan";
  readonly chatId: ChatId;
}

/** The prose auditor filed an edit proposal.
 *  PENDING EMITTER: no emit site in CW1 — it lands with `applyProseAudit` (CW5). Type-level mirror only for now. */
export interface CrewEditProposalCreatedEvent {
  readonly type: "crew.editProposalCreated";
  readonly chatId: ChatId;
  readonly proposalId: CrewEditProposalId;
}

/** The card-evolution auditor filed a card proposal. EMITTED in CW1 by `character.proposeCardEvolution` (the
 *  create site — the only mirror member with a live emit site, since its producer verb ships in CW1). */
export interface CrewCardProposalCreatedEvent {
  readonly type: "crew.cardProposalCreated";
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly proposalId: CardEvolutionProposalId;
}

/** The director completed a pass. Secret-free: no arc/twist/guidance payload — the plot is host-ring and
 *  never leaves `crew_plots`.
 *  PENDING EMITTER: no emit site in CW1 — it lands with `applyDirectorPass` (CW4). Type-level mirror only for now. */
export interface CrewDirectorPassCompletedEvent {
  readonly type: "crew.directorPassCompleted";
  readonly chatId: ChatId;
}

// ── rpg domain-event mirror (rpg-design/05 §5 / 09b) ────────────────────────────────────────────────────
// A curated, id-only subset of `RpgBusEvent` (the rpg SSE bus is the HUD/tracker consumer surface — a
// separate closed union) that the rpg verbs ALSO mirror here so D46 Tier-1 automation can trigger on game
// activity ("on rpg.clockCompleted do notify"). Their SPELLINGS are pinned by the landed rpg reservation in
// `DOMAIN_TRIGGER_TYPES` (`@orb/contracts/automation`) — this flip arms those reserved triggers. Id-only per
// D38: an automation consumer re-reads canon by the branded id, never trusting event-carried data; `chatId`
// is the membership scope key every game artifact reaches its authority through (D18). The embeddings indexer
// ignores all five (they touch no embeddable canon).

/** A progress clock completed (`tickClock` + the staged-tick flush). Hidden-clock completions mirror here too
 *  (the domain bus is server-internal automation, not the player HUD — the P3 host/member split is the rpg
 *  bus's concern, not this one). */
export interface RpgClockCompletedEvent {
  readonly type: "rpg.clockCompleted";
  readonly chatId: ChatId;
  readonly clockId: RpgClockId;
}

/** A session concluded (`concludeSession`) — the campaign spine advanced (the automation "next session" hook). */
export interface RpgSessionConcludedEvent {
  readonly type: "rpg.sessionConcluded";
  readonly chatId: ChatId;
  readonly sessionId: RpgSessionId;
}

/** An encounter ended (07 §1.2 terminal).
 *  PENDING EMITTER: no emit site until the encounter engine lands (R8); the member exists here now only to arm
 *  automation's reserved `rpg.encounterEnded` trigger (no coverage gate watches DOMAIN_EVENT emitters). */
export interface RpgEncounterEndedEvent {
  readonly type: "rpg.encounterEnded";
  readonly chatId: ChatId;
  readonly encounterId: RpgEncounterId;
}

/** A reputation tier crossing fired (`applyReputation`) — the consumer re-reads the NPC for the tier/direction. */
export interface RpgReputationMilestoneEvent {
  readonly type: "rpg.reputationMilestone";
  readonly chatId: ChatId;
  readonly npcId: RpgNpcId;
}

/** A skill check resolved (`resolveCheck`). Scope-only: a check persists no canon row (its provenance is the
 *  turn's `ToolCallRecord`), so the event carries the chat scope alone — the predicate reads the MacroEnv (09b). */
export interface RpgCheckResolvedEvent {
  readonly type: "rpg.checkResolved";
  readonly chatId: ChatId;
}

export type DomainEvent =
  | CharacterUpdatedEvent
  | AssetCreatedEvent
  | CrewKeeperRanEvent
  | CrewEditProposalCreatedEvent
  | CrewCardProposalCreatedEvent
  | CrewDirectorPassCompletedEvent
  | RpgClockCompletedEvent
  | RpgSessionConcludedEvent
  | RpgEncounterEndedEvent
  | RpgReputationMilestoneEvent
  | RpgCheckResolvedEvent;

/** The injected op an emitting domain calls; the composition root binds it to the bus. */
export type EmitDomainEvent = (event: DomainEvent) => void;
