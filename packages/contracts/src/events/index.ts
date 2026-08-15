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
import type { AssetId, CharacterId, PersonaId, WorldBookId } from "@orb/kit/ids";

// The discriminant axis (§7.5 one-union; a new event = a member here + a handler, nowhere else). The
// agents/rpg domain-event mirrors (curated, id-only subsets
// of those domains' own bus events so D46 Tier-1 automation could trigger on their activity) were purged
// with the 2026-07-25 rollback — no `crew.*`/`rpg.*` members exist today. The rebuild grafts them back onto
// this union (+ the matching `DOMAIN_TRIGGER_TYPES` reservation in `@orb/contracts/automation`) if either
// domain returns.
// BELTED 2026-08-14 (G-B, event-bus coverage survey §3.3): the `satisfies readonly DomainEvent["type"][]`
// is what brings this bus inside the coverage ratchets' quantifier — it was a plain `as const` precisely so
// `bus-definition-belts` would skip it, because belting it used to demand a CLIENT total map this
// server-internal bus can never have. That arm now carries a declared SERVER_INTERNAL reach lane (the
// `assertNever` subscriber at entry/compose/search-discovery.ts is the consumer belt), so the belt is
// honest. Every member emits today; the belt guards the NEXT one (this header already plans the
// `crew.*`/`rpg.*` grafts).
// GREW 2026-08-14 to four: `persona.updated` + `world-info.updated` are the entity→room member-freshness
// bridge's inputs (`docs/design/entity-room-member-freshness-bridge.md` §3.6). They have NO indexer consumer
// — the embeddings subscriber names them as explicit no-op cases — and exist so ONE reach engine at the
// composition root can fan a room event for every entity kind, instead of each domain growing its own
// chat-bus reach (which would be a sideways import).
export const DOMAIN_EVENT_TYPES = [
  "character.updated",
  "asset.created",
  "persona.updated",
  "world-info.updated",
] as const satisfies readonly DomainEvent["type"][];
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

/** A persona's CONTENT changed (name/title/description/avatar/metadata) — the entity→room bridge fans a
 *  `roomEntityChanged{entity:"persona"}` to every room the persona is live in: a human seat's member-visible
 *  displayName + avatar ARE their active persona's (`entry/compose/chat.ts::resolveUserPublics`), and the
 *  description feeds assembly. The indexer ignores it (personas are not an embedded source).
 *
 *  Emitted by `update` and `import`-restore. NOT by `remove`, and that is a receipt rather than an omission:
 *  `chat_participants.activePersonaId` and `chats.anchorPersonaId` are both `onDelete: "set null"`, and the
 *  reach lookup runs AFTER the write commits, so a post-delete fan resolves ∅ by construction — a member
 *  declared here would be a dead wire that reads as coverage. Delete-freshness needs a pre-write reach
 *  capture and is not this wave's. NOT by `create`/`duplicate`/`create-from-character` either: a
 *  brand-new persona is seated nowhere.
 *
 *  `personaId` is REQUIRED (unlike the user-bus's optional targeting hint — `contracts/user-bus` lets an
 *  emitter omit it): the reach resolver's SQL is keyed on it, so an absent id would silently lose rooms. */
export interface PersonaUpdatedEvent {
  readonly type: "persona.updated";
  readonly personaId: PersonaId;
}

/** A world book's CONTENT changed (the book row, or any of its entries) — the bridge fans a
 *  `roomEntityChanged{entity:"world-info"}` to every room whose per-turn assembly pool reads this book (all
 *  four scopes; `entry/compose/room-reach.ts`). DISTINCT from the `wiEntryScopeChanged` chat-bus fan the
 *  scope-affecting entry edits already do: that moves the ATTACHMENT view, this moves the ASSEMBLY.
 *
 *  Emitted by book `update` and entry `create`/`update`/`remove`/`reorder`/`upsert-entries`. NOT by
 *  `removeBook` — the same cascade receipt as `PersonaUpdatedEvent` (`chat_books.worldBookId` is
 *  `onDelete: "cascade"`, so the junction is gone before the reach query runs).
 *
 *  `bookId` is REQUIRED, for the reach lookup (see `PersonaUpdatedEvent`); an ENTRY edit reports its
 *  OWNING book, because attachment — and therefore reach — is per book, never per entry. */
export interface WorldInfoUpdatedEvent {
  readonly type: "world-info.updated";
  readonly bookId: WorldBookId;
}

export type DomainEvent = CharacterUpdatedEvent | AssetCreatedEvent | PersonaUpdatedEvent | WorldInfoUpdatedEvent;

/** The injected op an emitting domain calls; the composition root binds it to the bus. */
export type EmitDomainEvent = (event: DomainEvent) => void;
