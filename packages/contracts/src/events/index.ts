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

// The discriminant axis (§7.5 one-union; a new event = a member here + a handler, nowhere else). The
// agents/rpg domain-event mirrors (chat-crew-design/04 §4, rpg-design/05 §5 / 09b — curated, id-only subsets
// of those domains' own bus events so D46 Tier-1 automation could trigger on their activity) were purged
// with the 2026-07-25 rollback — no `crew.*`/`rpg.*` members exist today. The rebuild grafts them back onto
// this union (+ the matching `DOMAIN_TRIGGER_TYPES` reservation in `@orb/contracts/automation`) if either
// domain returns.
// BELTED 2026-08-14 (G-B, event-bus coverage survey §3.3): the `satisfies readonly DomainEvent["type"][]`
// is what brings this bus inside the coverage ratchets' quantifier — it was a plain `as const` precisely so
// `bus-definition-belts` would skip it, because belting it used to demand a CLIENT total map this
// server-internal bus can never have. That arm now carries a declared SERVER_INTERNAL reach lane (the
// `assertNever` subscriber at entry/compose/search-discovery.ts is the consumer belt), so the belt is
// honest. Both members emit today; the belt guards the NEXT one (this header already plans the
// `crew.*`/`rpg.*` grafts).
export const DOMAIN_EVENT_TYPES = ["character.updated", "asset.created"] as const satisfies readonly DomainEvent["type"][];
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
