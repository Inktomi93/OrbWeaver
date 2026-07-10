// domain/discovery/contract/results — the verb output shapes for the duplicate-character + theme/hub slice.
// (The fuller corpus surface — Browse/Catalog/Archetype/Insights/Image/Cooccurrence/Tag/Views — is FLAG[PD-40];
// those result shapes join with their verbs in a later wave. See contract/service.ts for the deferral list.)

import type { CharacterId, DuplicateCharacterPairId, ThemeClusterId } from "@orb/kit/ids";
import type { ThemeLevel } from "./params";

// ── near-duplicate characters ─────────────────────────────────────────────────
/** One owner-scoped near-duplicate CHARACTER pair (canonical `A<B`). `similarity` is the raw card-embedding
 *  cosine; `cslsScore` is the hub-adjusted rank key (`2·cos − hub_a − hub_b` — a generic/hub card is
 *  deflated). `nameA`/`nameB` are the live card names for display. `model` is the embedding-space tag the
 *  pair was computed in (a pair is only meaningful within one space). No `relation` — characters have no
 *  fork lineage (D27/D28); a character pair is always an accidental look-alike (schema/discovery.ts). */
export interface DuplicateCharacterPair {
  readonly id: DuplicateCharacterPairId;
  readonly characterIdA: CharacterId;
  readonly characterIdB: CharacterId;
  readonly nameA: string;
  readonly nameB: string;
  readonly similarity: number;
  readonly cslsScore: number;
  readonly model: string;
  readonly computedAt: number;
}

/** The `computeDuplicatePairs` recompute summary (a workload-runner log line). */
export interface DuplicateComputeStats {
  readonly ownersProcessed: number;
  readonly charactersScanned: number;
  readonly pairsWritten: number;
}

// ── themes ────────────────────────────────────────────────────────────────────
/** One owner-scoped emergent theme cluster (k-means over digest embeddings, LLM-named). `clusterIdx` is the
 *  stable address within (owner, level); `name` is null until the naming pass runs OR the cluster is below
 *  the name-worthiness floor; `size` is the FULL-space member count (NOT the content-collapsed rep count —
 *  esoteric #3). `model` is the embedding-space tag the centroid lives in. */
export interface ThemeRow {
  readonly id: ThemeClusterId;
  readonly level: ThemeLevel;
  readonly clusterIdx: number;
  readonly name: string | null;
  readonly size: number;
  readonly model: string;
  readonly computedAt: number;
}

/** The `computeThemes` recompute summary. `clustersWritten` counts clusters across all (owner, level, space)
 *  partitions; `digestsAssigned` counts the full-coverage assignment rows. */
export interface ThemeComputeStats {
  readonly ownersProcessed: number;
  readonly clustersWritten: number;
  readonly digestsAssigned: number;
}

// ── distill (PD-40 write-half: character summaries + staged tag suggestions) ───────────────────────────
/** The distilled facets parsed from ONE character's `summarize` reply (a null scalar = the model omitted it).
 *  `subGenres`/`tags` default to `[]` (always-a-list). `tags` are the descriptive labels the pass stages as
 *  `source:'auto', status:'pending'` tag-domain suggestions (the Accept/Reject queue); the rest fill the
 *  `character_summaries` row. Guided-decode keeps `genre`/`tone` inside the discovery-local GENRES/TONES
 *  grammar (verbs/distill.ts), so the db columns stay plain TEXT (schema/discovery.ts header). */
export interface CharacterDistillation {
  readonly genre: string | null;
  readonly tone: string | null;
  readonly setting: string | null;
  readonly subGenres: string[];
  readonly tags: string[];
  readonly elevatorPitch: string | null;
  readonly overview: string | null;
}

/** The `distillCharacters` pass summary (workload-runner / on-demand log line). `scanned` = cards read;
 *  `distilled` = `character_summaries` rows upserted; `failed` = replies that didn't parse; `tagsStaged` =
 *  pending suggestion junction rows NEWLY attached (an already-present/accepted tag doesn't re-count —
 *  idempotent). */
export interface DistillStats {
  readonly scanned: number;
  readonly distilled: number;
  readonly failed: number;
  readonly tagsStaged: number;
}

// ── hubness ─────────────────────────────────────────────────────────────────
/** The `computeCharacterHubScores` summary. `rowsScored` is the total vector rows whose `hub_score` was
 *  written (reps + the content-collapsed members that inherit a rep's score); `groupsProcessed` is the
 *  number of (space) partitions the CSLS pass ran over. The digest/segment/image hub passes return a bare
 *  `rowsScored` number (their grouping/return is simpler — see the service interface). */
export interface HubStats {
  readonly rowsScored: number;
  readonly groupsProcessed: number;
}
