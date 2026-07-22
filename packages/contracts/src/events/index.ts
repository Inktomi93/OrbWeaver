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
import type { AssetId, CharacterId } from "@orb/kit/ids";

// The discriminant axis (§7.5 one-union; a new event = a member here + a handler, nowhere else). The four
// `crew.*` members are the chat-crew domain-event MIRROR (chat-crew-design/04 §4): a curated, id-only subset
// of `CrewBusEvent` that a crew applier emits so D46 Tier-1 automation can trigger on crew activity. Their
// SPELLINGS are pinned by the landed `DOMAIN_TRIGGER_TYPES` reservation (`@orb/contracts/automation`) — this
// flip is what arms those reserved triggers. The emit sites land with each applier (CW2–CW5); CW1 lands the
// type-level mirror + the indexer's no-op arms so the closed-union dispatch stays exhaustive. The five `rpg.*`
// members are the rpg domain-event MIRROR (rpg-design/05 §5 / 09b — R5): the curated `RpgBusEvent` subset the
// rpg verbs mirror here so automation triggers on game activity (`rpg.encounterEnded` is a PENDING EMITTER
// until R8; the other four emit at their landed producer verbs — R5 also lands the indexer's no-op arms).
export const DOMAIN_EVENT_TYPES = ["character.updated", "asset.created"] as const;
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

export type DomainEvent = CharacterUpdatedEvent | AssetCreatedEvent;

/** The injected op an emitting domain calls; the composition root binds it to the bus. */
export type EmitDomainEvent = (event: DomainEvent) => void;
