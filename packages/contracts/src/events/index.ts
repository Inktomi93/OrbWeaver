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

// The discriminant axis (§7.5 one-union; a new event = a member here + a handler, nowhere else).
export const DOMAIN_EVENT_TYPES = ["character.updated", "asset.created"] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/** A character card was created/edited — the indexer re-embeds the card (`store(kind='card', lens='card-text')`). */
export interface CharacterUpdatedEvent {
  readonly type: "character.updated";
  readonly characterId: CharacterId;
}

/** An avatar asset was stored — the indexer embeds BOTH image lenses (`image-raw` + `image-captioned`). */
export interface AssetCreatedEvent {
  readonly type: "asset.created";
  readonly assetId: AssetId;
}

export type DomainEvent = CharacterUpdatedEvent | AssetCreatedEvent;

/** The injected op an emitting domain calls; the composition root binds it to the bus. */
export type EmitDomainEvent = (event: DomainEvent) => void;
