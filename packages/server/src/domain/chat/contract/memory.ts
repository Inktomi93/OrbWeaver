// domain/chat/contract/memory — the type HOME for the `memory/` subsystem (chat.md Part I §memory). The
// `types-in-contract` gate forbids an exported feature type in a subsystem file (verb/substrate/subsystem),
// so the subsystem's internal types are declared HERE and RE-EXPORTED from `memory/types.ts` (the connection/
// context.ts precedent — one type home, a conventional-slot re-export). These are subsystem-internal (they
// never cross a package boundary — the cross-domain wire shapes are `MemoryQueryOptions`/`BlockKey` in
// `@orb/contracts/search`); they live in `chat/contract/` only to satisfy the one-type-home gate.
//
// NO `ownerId` anywhere (D20 — the substrate derives owner via the chat FK, never a stamp); the scope key is
// `scopedCharacterId` (`''` = the shared/merged/narrator bucket, a CharacterId = a scoped-group egocentric
// bucket — §4). The canonical retrieval-mode axis DERIVES `MemoryRetrievalMode` (no inline union re-spell).

import type { MemoryRetrievalMode } from "@orb/contracts/search";
import type { CharacterId, ChatDigestId, ChatId, UserId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

/** The raw (partial) memory tuning — the admin-set `AppSettings.memoryDefaults` shape, every field optional.
 *  `resolveCfg` (constants.ts) fills the gaps from `DEFAULTS`. Re-spelled here (not imported from
 *  `@orb/contracts/settings`) so the subsystem owns exactly the knobs it consumes — the canonical mode axis
 *  still DERIVES `MemoryRetrievalMode` from `@orb/contracts/search` (no inline union re-spell). */
export interface MemoryConfig {
  readonly blockSize?: number | undefined;
  readonly verbatimWindow?: number | undefined;
  readonly queryWindow?: number | undefined;
  readonly mode?: MemoryRetrievalMode | undefined;
  readonly fanOut?: number | undefined;
  readonly maxTier?: number | undefined;
  readonly retrieveK?: number | undefined;
  readonly rerankTo?: number | undefined;
  readonly minScore?: number | undefined;
  readonly keywordMatch?: boolean | undefined;
  readonly recencyBias?: number | undefined;
}

/** The fully-resolved config every build/recall step reads (no optionals — `resolveCfg` guarantees a value
 *  for each knob from `DEFAULTS`). */
export interface ResolvedMemoryConfig {
  readonly blockSize: number;
  readonly verbatimWindow: number;
  readonly queryWindow: number;
  readonly mode: MemoryRetrievalMode;
  readonly fanOut: number;
  readonly maxTier: number;
  readonly retrieveK: number;
  readonly rerankTo: number;
  readonly minScore: number;
  readonly keywordMatch: boolean;
  readonly recencyBias: number;
}

/** The egocentric memory bucket (§4): which "pile" a build writes / a recall reads. `scopedCharacterId=''`
 *  is the shared bucket (solo/merged/narrator — everyone sees everything); a CharacterId is a scoped-group
 *  per-character bucket (egocentric-only recall). `isGroup` rides onto the digest row (`chat_digests.isGroup`,
 *  the analytics split). Derived by the engine at compose from `cardScope` + the active speaker — NOT a branch
 *  here (`no-if-is-group`: solo is `{scopedCharacterId:'', isGroup:false}`, byte-identical to merged-of-one). */
export interface MemoryScope {
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId | "";
  readonly isGroup: boolean;
}

/** One canon message memory reads (slot ⋈ selected variant — D26). The stable speaker identity
 *  (`characterId`/`authorUserId`) folds into the content hash (rename-robust, re-attribution-aware — the
 *  self-heal esoteric); `content` is the verbatim body. */
export interface MsgRow {
  readonly seq: number;
  readonly role: MessageRole;
  readonly characterId: CharacterId | null;
  readonly authorUserId: UserId | null;
  readonly content: string;
}

/** A complete, aged-out block of canon (the `blockSize`-message digest/segment unit). `blockIdx` is the
 *  fixed-width index within the chat; the rows are the block's messages oldest→newest. */
export interface BlockSpan {
  readonly blockIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly rows: readonly MsgRow[];
}

/** A `chat_digests` row as memory reads it — the NON-vector facets (the `embedding`/`hubScore`/`model`/`dim`
 *  columns are search's/discovery's, never read here). `contentHash` is the staleness key; `topicAnchor` +
 *  `keywords` are the retrieval facets `{{memory}}` is formatted from (the distilled facts body lives only in
 *  the embedding — FLAG[no-digest-body] in `format.ts`). */
export interface DigestRow {
  readonly id: ChatDigestId;
  readonly scopedCharacterId: CharacterId | "";
  readonly isGroup: boolean;
  readonly tier: number;
  readonly blockIdx: number;
  readonly contentHash: string;
  readonly topicAnchor: string | null;
  readonly keywords: readonly string[];
}

/** The outcome of a build pass (digests or segments) — written = newly stored (or re-stored on a hash diff);
 *  skipped = the `content_hash` was unchanged (the self-heal no-op). Mirrors the workloads `MaintenancePass
 *  Counts` shape so the composition root can wire it into the `memory-backfill` runner (PD-41). */
export interface MemoryPassCounts {
  readonly written: number;
  readonly skipped: number;
}
