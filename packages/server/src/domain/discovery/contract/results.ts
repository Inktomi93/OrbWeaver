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

// ── hubness ─────────────────────────────────────────────────────────────────
/** The `computeCharacterHubScores` summary. `rowsScored` is the total vector rows whose `hub_score` was
 *  written (reps + the content-collapsed members that inherit a rep's score); `groupsProcessed` is the
 *  number of (space) partitions the CSLS pass ran over. The digest/segment/image hub passes return a bare
 *  `rowsScored` number (their grouping/return is simpler — see the service interface). */
export interface HubStats {
  readonly rowsScored: number;
  readonly groupsProcessed: number;
}
