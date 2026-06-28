// domain/discovery/contract/service — the typed API surface (read THIS to know everything the slice does;
// discovery.md §"Verbs"). Holds:
//   • DiscoveryContext      the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4)
//   • DiscoveryServiceDeps  what the entry root supplies (identical to the context — no transform)
//   • DiscoveryService      the authoritative verb interface (the front door re-exports the type)
//   • the standalone-compute DEPS shapes (the workload runners construct these directly — see below)
//   • the injected cross-feature op types (type-only — wired at the composition root)
//
// ── THE INJECTION MODEL (boundaries-are-physics) ───────────────────────────────────────────────────────
// discovery embeds NOTHING and writes no vector row (discovery.md §"The defining seam"). It reads the vector
// store read-only (via @orb/db), computes its signals in-RAM (@orb/kit/vector-math + substrate), and writes
// ONLY its own rollup tables + the `hub_score` column — the latter through the INJECTED `writeHubScores`
// seam (the embeddings domain owns the write mechanism; discovery owns the values; search reads — §1/§8).
// Cross-feature capability arrives as injected ops, type-only on the bundle, wired at the entry root:
//   - `writeHubScores` — `EmbeddingsService["writeHubScores"]` (type-only `#domain/embeddings` import — the
//     sanctioned cross-feature SHAPE import, depcruise `domain-no-cross-feature`: "TYPE-ONLY imports across
//     features ARE allowed"). The ONLY non-`store` vector-table write + the ONLY `hub_score` writer.
//   - `summarize` — the bound `RoleClients["summarize"]` callable (the entry root binds credential+model via
//     `connection.resolveRole(summarize)` and threads the THUNK in; discovery never sees a credential and
//     NEVER gets `embed` — it embeds nothing, discovery.md §"Embeds nothing"). Used for theme NAMING only.
//   - `now` / `new*Id` — the injected clock + id minters (determinism — no ambient `Date.now()`/`typeid()`).
//
// RECONCILIATION (the task prompt's older framing): the prompt said "inject search (knn/findCharacters) +
// connection.resolveRole + RoleClients". The DOC wins (CLAUDE.md). This slice — duplicate-CHARACTER
// detection + theme/hub discovery — uses NONE of `search`: character near-dup is in-RAM all-pairs
// (discovery.md §"Two cosine access patterns": discovery keeps the all-pairs pattern, search owns top-k).
// `search.findCharacters` is consumed by the DEFERRED similarity-graph/dossier surface, not this slice — so
// it is NOT on the bundle (no unused dep). `connection.resolveRole` + the RoleClients BIND happen at the
// entry root; discovery receives the already-bound `summarize` thunk, not the resolver.
//
// ── DEFERRAL LEDGER (this slice = duplicate-character + theme/hub) ──────────────────────────────────────
// FLAG[PD-40]: the rest of the corpus surface → later discovery waves —
//   distill/browse/facets, archetypes/projection, similarity-graph/similar-chats (needs injected `search`),
//   catalog/compare/analyze/askCard, swipes, insights (themeDrift/unusedCharacters + the stats-composed
//   forgottenGems/modelRouting), tag-suggest, image-analytics (cross-modal + facets), cooccurrence, the
//   composed home/dossier/themeDetail views, AND the chat near-dup arm (`duplicate_chat_pairs` Jaccard +
//   forkRoots + the `relation` axis — needs the chat fork-lineage walk). Each lands with its verb + result
//   type + the injected ops it needs (`search`, the `stats` economics op, the semantic `messages` read).
// FLAG[PD-39]: `digest_theme_assignments.msgMidAt` backfill (the position-median story-time stamp) →
//   the themeDrift wave when the semantic `messages` projection lands (it powers themeDrift only; the column
//   is nullable, so assignments write without it now).
// FLAG[PD-22] — the stats `messages-economics` read → it stays a DEFER: this slice computes NO
//   per-character economics (forgottenGems/modelRouting are the only economics consumers, both deferred).
//   When built it MUST be the D26-aware read (economics live on `message_variants`, NOT `messages`).

import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type { DuplicateCharacterPairId, ThemeClusterId, UserId } from "@orb/kit/ids";
// Type-only cross-feature SHAPE import (depcruise domain-no-cross-feature: type-only across features is
// allowed; the runtime op is wired at the entry composition root). discovery imports no embeddings runtime.
import type { EmbeddingsService } from "#domain/embeddings";
import type {
  ComputeDuplicatesOptions,
  ComputeHubScoresOptions,
  ComputeThemesOptions,
  DuplicateCharactersOptions,
  ThemeLevel,
} from "./params";
import type {
  DuplicateCharacterPair,
  DuplicateComputeStats,
  HubStats,
  ThemeComputeStats,
  ThemeRow,
} from "./results";

// ── injected cross-feature ops (type-only; wired at the root) ─────────────────
/** The `hub_score` write seam — the embeddings domain's `writeHubScores` verb, bound at the entry root. The
 *  ONLY path discovery touches a vector table; it takes pre-computed scores as DATA (no CSLS math). */
export type WriteHubScores = EmbeddingsService["writeHubScores"];

/** The bound `summarize` role thunk (credential+model already bound at the root). discovery's ONLY inference
 *  surface — used for theme naming; it never receives `embed` (it embeds nothing). */
export type Summarize = RoleClients["summarize"];

// ── the standalone-compute DEPS shapes (the workload runners construct these directly) ─────────────────
// discovery.md §"Verbs": the `compute*` passes keep a `(db, deps, opts?)` standalone export (re-exported
// from the front door) so the `transport/jobs` runners (find-duplicates / compute-themes / csls) build their
// own injected ops WITHOUT threading the whole service. These are the minimal per-pass slices of the context.

/** Deps for the standalone `computeDuplicatePairs` (no inference, no hub write — pure all-pairs + persist). */
export interface ComputeDuplicatesDeps {
  readonly now: () => number;
  readonly newDuplicateCharacterPairId: () => DuplicateCharacterPairId;
}

/** Deps for the standalone `computeThemes` (k-means + LLM naming via the bound `summarize` thunk). */
export interface ComputeThemesDeps {
  readonly now: () => number;
  readonly newThemeClusterId: () => ThemeClusterId;
  readonly summarize: Summarize;
}

/** Deps for the standalone `compute*HubScores` passes (the CSLS values are written through the seam). */
export interface ComputeHubScoresDeps {
  readonly writeHubScores: WriteHubScores;
}

// ── the DI bundle (the full context the service factory closes over) ──────────
/**
 * The DI bundle the discovery verbs close over (assembled at `entry/`, surfaced via `context.ts`). It is the
 * UNION of every standalone pass's deps + the db + the read-path needs. discovery sideways-imports no sibling
 * runtime (domain-no-cross-feature) and writes NO vector row directly — `writeHubScores` is the only seam.
 */
export interface DiscoveryContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newDuplicateCharacterPairId: () => DuplicateCharacterPairId;
  readonly newThemeClusterId: () => ThemeClusterId;
  readonly summarize: Summarize;
  readonly writeHubScores: WriteHubScores;
}

/** What `createDiscoveryService` receives from the entry root. Identical to {@link DiscoveryContext} — no
 *  deps→context transform; the name is kept for front-door symmetry with the other domains. */
export type DiscoveryServiceDeps = DiscoveryContext;

// ── the verb interface ────────────────────────────────────────────────────────
/**
 * The discovery surface for THIS slice — duplicate-CHARACTER detection + theme/hub discovery. Every read
 * verb takes the already-resolved `UserId` (branded at the tRPC seam) and forwards it as `ownerId`; a verb
 * NEVER accepts a caller-supplied ownerId (audit #1 — the cross-user-write P0). The `compute*` passes are
 * workload-driven (no principal — global recomputes); the reads are owner-scoped.
 */
export interface DiscoveryService {
  // ── near-duplicate characters (workload compute + owner-scoped read) ────────
  /** Recompute every owner's near-duplicate CHARACTER pairs (within-owner, within-space all-pairs cosine,
   *  content-hash collapsed, CSLS-ranked) — a full atomic replace of `duplicate_character_pairs`. */
  readonly computeDuplicatePairs: (
    opts?: ComputeDuplicatesOptions,
  ) => Promise<DuplicateComputeStats>;
  /** The owner's near-duplicate character pairs, CSLS-ranked (highest first). */
  readonly duplicateCharacters: (
    userId: UserId,
    opts?: DuplicateCharactersOptions,
  ) => Promise<DuplicateCharacterPair[]>;

  // ── themes (workload compute + owner-scoped read) ───────────────────────────
  /** Recompute every owner's emergent themes (k-means over solo digest embeddings per level/space, full
   *  coverage assignment, LLM-named) — a full atomic replace of `theme_clusters` (+ CASCADE assignments). */
  readonly computeThemes: (opts?: ComputeThemesOptions) => Promise<ThemeComputeStats>;
  /** The owner's theme clusters at `level` (both levels when omitted), ordered by `clusterIdx`. */
  readonly themes: (userId: UserId, level?: ThemeLevel) => Promise<ThemeRow[]>;

  // ── hubness (workload-driven; CSLS values written via the injected writeHubScores seam) ─────────────
  /** Compute + write `character_embeddings.hub_score` (CSLS mean-cosine, per-space, content-collapsed). */
  readonly computeCharacterHubScores: (opts?: ComputeHubScoresOptions) => Promise<HubStats>;
  /** Compute + write `chat_digests.hub_score` (grouped per (tier, space) — digests, esoteric #5). */
  readonly computeDigestHubScores: (opts?: ComputeHubScoresOptions) => Promise<number>;
  /** Compute + write `chat_segments.hub_score` (per-space). */
  readonly computeSegmentHubScores: (opts?: ComputeHubScoresOptions) => Promise<number>;
  /** Compute + write `image_embeddings.hub_score` (per-space; image↔image ONLY — never read on text→image,
   *  esoteric #2; discovery stamps it, `search` omits it cross-modally). */
  readonly computeImageHubScores: (opts?: ComputeHubScoresOptions) => Promise<number>;
}
