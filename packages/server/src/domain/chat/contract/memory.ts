// domain/chat/contract/memory — the type HOME for the `memory/` subsystem. The
// `types-in-contract` gate forbids an exported feature type in a subsystem file (verb/substrate/subsystem),
// so the subsystem's internal types are declared HERE and RE-EXPORTED from `memory/types.ts` (the connection/
// context.ts precedent — one type home, a conventional-slot re-export). These are subsystem-internal (they
// never cross a package boundary — the cross-domain wire shapes are `MemoryQueryOptions`/`BlockKey` in
// `@orb/contracts/search`); they live in `chat/contract/` only to satisfy the one-type-home gate.
//
// NO `ownerId` anywhere (D20 — the substrate derives owner via the chat FK, never a stamp); the scope key is
// `scopedCharacterId`, ALWAYS a real `CharacterId` (inv 8 — solo's cast char / the synthetic group-as-character
// `__group__${chatId}` for solo/merged/narrator / a per-witnessing cast char under scoped; NO `''` sentinel,
// NO NULL — §4). The canonical retrieval-mode axis DERIVES `MemoryRetrievalMode` (no inline union re-spell).

import type { MemoryRetrievalMode } from "@orb/contracts/search";
import type { CharacterId, ChatDigestId, ChatId, PersonaId, UserId } from "@orb/kit/ids";
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

/** The egocentric memory bucket (§4): which "pile" a build writes / a recall reads. `scopedCharacterId` is
 *  ALWAYS a real `CharacterId` (inv 8): the synthetic group-as-character for the shared bucket (solo/merged/
 *  narrator — everyone sees everything), or a cast character's id for a scoped-group per-character bucket
 *  (egocentric-only recall). `isGroup` rides onto the digest row (`chat_digests.isGroup`, the analytics split).
 *  Derived by the engine at compose from `cardScope` + the active speaker — NOT a branch here (`no-if-is-group`:
 *  solo keys the same way as merged-of-one, just with the cast char vs the synthetic group char). */
export interface MemoryScope {
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  readonly isGroup: boolean;
}

/** One canon message memory reads (slot ⋈ selected variant — D26). The stable speaker identity
 *  (`characterId`/`authorUserId`) AND the authoring `personaId` (D-100 stamp) both fold into the content
 *  hash — rename-robust but re-attribution-AWARE across BOTH axes: a `{{char}}` re-voice (characterId) and a
 *  `{{user}}` persona reattribution (personaId) each bust the block hash so the digest self-heals (was
 *  persona-blind before — a persona re-stamp was a silent no-op on memory). `personaId` also drives the
 *  transcript BODY's `{{user}}`/`{{persona}}` resolution (via `resolveRowMacros`) so the summarizer/embedding
 *  sees the real persona name, never the literal macro. `content` is the verbatim (raw-macro) body. */
export interface MsgRow {
  readonly seq: number;
  readonly role: MessageRole;
  readonly characterId: CharacterId | null;
  readonly authorUserId: UserId | null;
  readonly personaId: PersonaId | null;
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
 *  columns are search's/discovery's, never read here). `contentHash` is the staleness key; `text` is the
 *  stored distilled body (§2b) that fills `{{memory}}`; `topicAnchor` + `keywords` are the retrieval facets
 *  (used for the consolidation delta prompt). `scopedCharacterId` is a real `CharacterId` (inv 8). */
export interface DigestRow {
  readonly id: ChatDigestId;
  readonly scopedCharacterId: CharacterId;
  readonly isGroup: boolean;
  readonly tier: number;
  readonly blockIdx: number;
  readonly text: string;
  readonly contentHash: string;
  readonly topicAnchor: string | null;
  readonly keywords: readonly string[];
}

/** The outcome of a build pass (digests or segments) — written = newly stored (or re-stored on a hash diff);
 *  skipped = the `content_hash` was unchanged (the self-heal no-op). Mirrors the workloads
 *  `MaintenancePassCounts` shape so the composition root can wire it into the `memory-backfill` runner (PD-41). */
export interface MemoryPassCounts {
  readonly written: number;
  readonly skipped: number;
}

/** One presence interval of a character in a chat (the join/leave WITNESSING horizon — knowledge-cluster §4 /
 *  inv 12). `joinSeq` = the `messages.seq` at which the character became present; `leftSeq` = the seq at which
 *  it left (exclusive — present for `seq ∈ [joinSeq, leftSeq)`), or `null` when still present. A kick→re-add
 *  yields MULTIPLE intervals (the kicked span stays invisible). Sourced from `chat_participants` by the engine
 *  (or `loadWitnessHorizons`); the build/recall LOGIC takes them as data (determinism — no ambient read). */
export interface WitnessInterval {
  readonly joinSeq: number;
  readonly leftSeq: number | null;
}

/** The per-call recall observability fragment (knowledge-cluster §3a `memoryTrace.recall`). `queryEmbedded`
 *  is whether the per-turn query embed fired (false for off / empty-pool / non-embedding modes — inv 10). */
export interface MemoryRecallTrace {
  readonly mode: MemoryRetrievalMode;
  readonly poolSize: number;
  readonly surfaced: number;
  readonly queryEmbedded: boolean;
  readonly ms: number;
}

/** The per-call build observability fragment (knowledge-cluster §3a `memoryTrace.build`). */
export interface MemoryBuildTrace {
  readonly blocksBuilt: number;
  readonly blocksSkipped: number;
  readonly summarizeCalls: number;
  readonly embedCalls: number;
  /** Blocks NOT digested because the summarizer token-guard could not fit even one message (§3a — skip-and-
   *  flag, never silent truncation). */
  readonly blocksSkippedTokenGuard: number;
  /** Blocks/consolidations whose summarizer returned EMPTY output — NOT stored (an empty digest keyed by the
   *  block's content-hash would skip forever with blank text, silently dropping the span from `{{memory}}`).
   *  Skip-and-flag so the NEXT build retries the block (D55(8) — degrade VISIBLY, never silent). */
  readonly blocksSkippedEmpty: number;
  readonly ms: number;
}

/** A structured memory observability event (knowledge-cluster §3a — "did memory work this turn, and why" is a
 *  first-class, greppable fact). Discriminated on `event`; `note` carries the zero-work / degrade reason
 *  ("no digests" / "no aged-out block" / "summarizer context below floor"). */
export type MemoryLogEntry =
  | {
      readonly event: "memory.recall";
      readonly chatId: ChatId;
      readonly scopedCharacterId: CharacterId;
      readonly trace: MemoryRecallTrace;
      readonly note?: string | undefined;
    }
  | {
      readonly event: "memory.build";
      readonly chatId: ChatId;
      readonly scopedCharacterId: CharacterId;
      readonly trace: MemoryBuildTrace;
      readonly note?: string | undefined;
    };

/** The injected structured logger the memory build/recall emit through (the `ChatContext.log` seam — the
 *  composition root binds it to `#foundation/observability`; tests capture the entries). Synchronous +
 *  side-effect-only (never throws into the turn path). */
export type MemoryLog = (entry: MemoryLogEntry) => void;

/** The parsed summarizer output (build/substrate/parse). `facts` is the significance-filtered body (embedded
 *  for retrieval, NOT persisted as a column — only `topicAnchor` + `keywords` land on `chat_digests`). */
export interface ParsedDigest {
  readonly topicAnchor: string;
  readonly facts: string;
  readonly keywords: string[];
}

// ── The PD-41 corpus-sweep counts (`substrate/backfill.ts` — the workloads runner-env adapts these; the
//    workload contract declares its own structurally-identical shapes, never imports chat's). ──

/** One sweep pass's fold: entities visited × rows actually written. */
export interface BackfillPassCounts {
  readonly scanned: number;
  readonly changed: number;
}

/** The memory-backfill sweep result: the segment pass (scanned = chats) + the digest pass (scanned =
 *  scope buckets). */
export interface MemoryBackfillCounts {
  readonly segments: BackfillPassCounts;
  readonly digests: BackfillPassCounts;
}

/** Resolve a host's effective memory tuning for the PD-41 corpus sweep — the SAME merge the live turn path
 *  applies (`entry/compose/chat.ts resolveMemoryConfig`: `AppSettings.memoryDefaults` ⊕ host
 *  `UserSettings.memory.enabled === false → mode:"off"`), extracted to ONE home so the sweep and the turn
 *  can't drift. Injected into {@link backfillMemory} (NOT `ChatContext` — there is no settings-read op there,
 *  engine.ts header): the sweep resolves it off each chat's HOST and SKIPS a `mode:"off"` host's chats
 *  entirely (D36 opt-out honored on the corpus sweep, not just the live turn — #54). */
export type ResolveBackfillMemoryConfig = (hostUserId: UserId) => Promise<MemoryConfig>;
