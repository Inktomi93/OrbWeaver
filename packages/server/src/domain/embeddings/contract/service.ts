// domain/embeddings/contract/service — the typed API surface (read THIS to know everything the slice does).
// Holds the two DI bundles (explicit interfaces — §7.4 / no-context-returntype), the verb interface, the
// injected cross-feature op types, and the indexer interface.
//
// WHY the indexer interface lives HERE (not in `indexer/types.ts` as the domain doc sketched): the
// `no-inline-types` grit flags ANY exported `interface`/`type` inside `domain/**` outside `contract/`. The
// gate wins over the doc's illustrative layout — every exported type homes in `contract/`; `indexer/` ships
// only the factory (a function) + its handlers (functions). The front door re-exports `EmbeddingsIndexer`
// from here.
//
// BOUNDARIES (domain-no-cross-feature): embeddings sideways-imports NO sibling runtime. Every cross-feature
// capability arrives as an INJECTED op, type-only on the bundles, wired at the entry composition root:
//   - `roleClients` — the `@orb/contracts/role-clients` bundle (embed/imageEmbed/summarize PRE-BOUND with
//     the credential+model the boot binder resolved via `connection.resolveRole(<role>)` per role; the
//     RESOLVED "keep the bundle" seam, core/Tier-3b-Providers.md). The `(model)` space tag is read off
//     `roleClients.embedModel` / `imageEmbedModel` (role-clients: "stored on every embedding row's model
//     column"). No raw `providers.embed` + `connection.resolveRole` scatter; no runner/family ever named
//     (providers-runner-seal).
//   - `loadCardText` / `loadAssetBytes` — the indexer re-reads CANON by id (the event carries only a branded
//     id; the subscriber never trusts event-carried data — @orb/contracts/events). `character` / `assets`
//     provide these projections at the root; embeddings imports neither.
// There is NO `principal`/guard on any bundle — the vector substrate carries no `ownerId` (D20); the store
// is a pure producer-FK mechanism and reads no `users` row (no-direct-users-read is trivially satisfied).

import type { AssetCreatedEvent, CharacterUpdatedEvent } from "@orb/contracts/events";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type {
  AssetId,
  CharacterEmbeddingId,
  CharacterId,
  ChatDigestId,
  ChatSegmentId,
  ImageEmbeddingId,
} from "@orb/kit/ids";
import type { ClearTableParams, StoreParams, WriteHubScoresParams } from "./params";
import type { StoreResult, WriteHubScoresResult } from "./results";

// ── injected cross-feature ops (type-only; wired at the root) ─────────────────
/** Re-read a character card's embeddable text by id (canon, not event payload). `undefined` when the card
 *  was deleted between the emit and the handler. Provided by `character` at the composition root. */
export type LoadCardText = (characterId: CharacterId) => Promise<string | undefined>;

/** Re-read an avatar asset's (resized) bytes by id. `undefined` when the asset was deleted between the emit
 *  and the handler. Provided by `assets` at the composition root. */
export type LoadAssetBytes = (assetId: AssetId) => Promise<Uint8Array | undefined>;

// ── the store/maintenance DI bundle (the `store` / `writeHubScores` / `clearTable` verbs close over) ──
/**
 * The DI bundle the embeddings verbs close over (assembled at `entry/`, surfaced via `context.ts`).
 *   - `db` — the libSQL handle; all access routes through `persistence/`.
 *   - `roleClients` — the bound inference bundle (`store` calls `embed` / `imageEmbed`; the model tag is its
 *     `embedModel` / `imageEmbedModel`).
 *   - `now` — the injected clock (epoch-ms); no ambient `Date.now()` (test-determinism).
 *   - `newCharacterEmbeddingId` / `newImageEmbeddingId` / `newChatDigestId` / `newChatSegmentId` — injected
 *     id minters (no ambient `mintTypeId()`). The chat-digest/segment minters back the `digest` / `segment`
 *     store arms (domains/memory.md §1/§2); wired at the entry root (`compose/services.ts`).
 */
export interface EmbeddingsContext {
  readonly db: Db;
  readonly roleClients: RoleClients;
  readonly now: () => number;
  readonly newCharacterEmbeddingId: () => CharacterEmbeddingId;
  readonly newImageEmbeddingId: () => ImageEmbeddingId;
  readonly newChatDigestId: () => ChatDigestId;
  readonly newChatSegmentId: () => ChatSegmentId;
}

/** What `createEmbeddingsService` receives from the entry root. Identical to {@link EmbeddingsContext} — no
 *  deps→context transform; the name is kept for front-door symmetry with the other domains. */
export type EmbeddingsServiceDeps = EmbeddingsContext;

// ── the verb interface (the front door re-exports the type) ───────────────────
export interface EmbeddingsService {
  /** The ONLY vector inserter (§the defining invariant). Hash-gates on `(key, model)` — a matched
   *  `content_hash` is a `noop` (no re-embed, no write) — else embeds via the injected role op, asserts the
   *  produced vector matches the declared space `dim` ({@link SpaceMismatchError}), and upserts the row.
   *  NEVER touches `hub_score` (§invariant 2 — the advisory-stale column is `discovery`'s alone). */
  readonly store: (params: StoreParams) => Promise<StoreResult>;
  /** The ONLY path that writes `hub_score` (§invariant 3) — the `discovery` → embeddings seam. Takes
   *  pre-computed scores as data (no CSLS math) and batch-UPDATEs them keyed `(id, model)`. */
  readonly writeHubScores: (params: WriteHubScoresParams) => Promise<WriteHubScoresResult>;
  /** Maintenance: wipe a primary vector table (a plain `DELETE FROM`; safe — no ANN/DiskANN shadow index). */
  readonly clearTable: (params: ClearTableParams) => Promise<void>;
}

// ── the indexer DI bundle + interface (the event-driven subscriber) ───────────
/**
 * The DI bundle the indexer handlers close over (assembled at `entry/`).
 *   - `store` — the bound store verb (the indexer dispatches re-embeds through the one write path).
 *   - `loadCardText` / `loadAssetBytes` — the canon re-readers (re-read by id; skip when the source is gone).
 *   - `roleClients` — for the inline `image-captioned` caption (`summarize`) + the `(model)` tags
 *     (`embedModel` / `imageEmbedModel`).
 *   - `embedDim` / `imageEmbedDim` — the active embed/imageEmbed space `dim` the root declares (the store
 *     verb asserts the produced vector matches it). Injected, not baked — embeddings stays space-agnostic.
 */
export interface EmbeddingsIndexerContext {
  readonly store: EmbeddingsService["store"];
  readonly loadCardText: LoadCardText;
  readonly loadAssetBytes: LoadAssetBytes;
  readonly roleClients: RoleClients;
  readonly embedDim: number;
  readonly imageEmbedDim: number;
}

/** The event subscription shape `entry/` binds onto the in-process bus: `character.updated` →
 *  `onCharacterUpdated` (re-embed the card), `asset.created` → `onAssetCreated` (embed BOTH image lenses).
 *  Handlers take the typed `@orb/contracts/events` payload; each re-reads canon by id and dispatches to
 *  `store`. (Debounce/coalesce is an entry/bus concern — the open "event system" decision — not baked here.) */
export interface EmbeddingsIndexer {
  readonly onCharacterUpdated: (event: CharacterUpdatedEvent) => Promise<void>;
  readonly onAssetCreated: (event: AssetCreatedEvent) => Promise<void>;
}
