// domain/chat/contract/memory — the type HOME for the `memory/` subsystem. The
// `types-in-contract` gate forbids an exported feature type in a subsystem file (verb/substrate/subsystem),
// so the subsystem's internal types are declared HERE and RE-EXPORTED from `memory/types.ts` (the connection/
// context.ts precedent — one type home, a conventional-slot re-export). These are subsystem-internal (they
// never cross a package boundary — the cross-domain wire shapes are `MemoryQueryOptions`/`BlockKey` in
// `@orb/contracts/search`, and the corpus-sweep RESULTS at the bottom of this file, which DERIVE
// `@orb/contracts/chat`); they live in `chat/contract/` only to satisfy the one-type-home gate.
//
// IMPORT DIRECTION — THIS FILE IS A LEAF, AND THAT IS THE RULE, NOT AN ACCIDENT. `context.ts` (the chat
// domain's contract hub) imports FROM here; this file imports NOTHING from a sibling in `contract/`. The one
// time a type was declared in `context.ts` and pulled back here (`MemoryEmbedSpace`, #2475) it closed three
// `no-circular` rings at once — `context.ts` → {`memory.ts`, `results.ts` → `memory.ts`, `foreign.ts` →
// `memory.ts`} → `context.ts` (#2484). `import type` does NOT exempt an edge from dependency-cruiser. So: a
// memory-subsystem SHAPE is declared HERE and `context.ts` imports it downward; only the INJECTED-OP types
// over that shape (`ResolveMemoryEmbedSpaceOp`, `EmbeddingsStoreOp`) stay in `context.ts`, because an op is a
// `ChatContext` member and the DI bundle is what `context.ts` owns.
//
// NO `ownerId` anywhere (D20 — the substrate derives owner via the chat FK, never a stamp); the scope key is
// `scopedCharacterId`, ALWAYS a real `CharacterId` (inv 8 — solo's seated character / the synthetic group-as-character
// `__group__${chatId}` for solo/merged/narrator / a per-witnessing seated character under scoped; NO `''` sentinel,
// NO NULL — §4). The canonical retrieval-mode axis DERIVES `MemoryRetrievalMode` (no inline union re-spell).

import type { BackfillPassResult, ChatBusEvent, MemoryBackfillResult, MemoryRecallSlice, MessageKind } from "@orb/contracts/chat";
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
}

/** The egocentric memory bucket (§4): which "pile" a build writes / a recall reads. `scopedCharacterId` is
 *  ALWAYS a real `CharacterId` (inv 8): the synthetic group-as-character for the shared bucket (solo/merged/
 *  narrator — everyone sees everything), or a seated character's id for a scoped-group per-character bucket
 *  (egocentric-only recall). `isGroup` rides onto the digest row (`chat_digests.isGroup`, the analytics split).
 *  Derived by the engine at compose from `cardScope` + the active speaker — NOT a branch here (`no-if-is-group`:
 *  solo keys the same way as merged-of-one, just with the seated character vs the synthetic group char). */
export interface MemoryScope {
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  readonly isGroup: boolean;
}

/** The owner + concrete vector-space tag one memory pass resolved before reading its hash gates. The SPACE is
 *  a memory-subsystem shape, so it is declared here (the file header's leaf rule) and `context.ts` imports it
 *  to type the injected ops that resolve/stamp it — never the reverse. */
export interface MemoryEmbedSpace {
  readonly ownerId: UserId;
  readonly model: string;
  readonly generationId: string;
  readonly generationEpoch: number;
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
  /** The row's DECLARED purpose (D129) — the transcript LABEL dispatches on it (`speakerLabel`), so a narrator
   *  recap is labelled as the narrator even after its synthetic authoring card is deleted and its `characterId`
   *  SET-NULLs. Deliberately NOT folded into {@link blockHash}: kind is immutable per row (no writer re-stamps
   *  one), so folding it would only change every stored hash for nothing. */
  readonly kind: MessageKind;
  readonly characterId: CharacterId | null;
  readonly authorUserId: UserId | null;
  readonly personaId: PersonaId | null;
  readonly content: string;
}

/** The ROUND-LEVEL recall inputs the engine re-runs `recallMemory` with PER SCOPED SPEAKER (the per-speaker
 *  witnessed recall). Gathered ONCE at round assemble (the recent window + character name map + the shared
 *  group-as-character bucket are all speaker-invariant); the engine varies only `scopedCharacterId` + the
 *  speaker's join/leave `witnessing` horizons, so a scoped speaker recalls its OWN egocentric, horizon-filtered
 *  memory while merged/narrator/solo rounds keep the round-level shared recall byte-identically. `null` when
 *  there is no character to key on (memory off / an empty roster) — the engine then leaves `memory` untouched. */
export interface MemoryRecallInputs {
  /** The shared (group-as-character) bucket — the round-level merged recall keyed on it. */
  readonly groupCharacterId: CharacterId;
  /** The recent window (oldest→newest) the mixB/mixC egocentric query is built from. */
  readonly recent: readonly MsgRow[];
  /** The character name map the egocentric query prefixes speakers with. */
  readonly names: ReadonlyMap<CharacterId, string>;
  /** The resolved memory config the round-level recall used (so the per-speaker re-run matches its tuning). */
  readonly config: MemoryConfig | null;
  /** Turn-scoped rerank-degrade state shared by the round recall and every per-speaker recall. It owns the
   * one-warning boundary: many failed reranks in one turn collapse to one notice, while the next turn gets a
   * fresh episode and may report a continuing outage again. */
  readonly warningEpisode: MemoryRecallWarningEpisode;
  /** The live-window cutoff seq (the PREVIOUS turn's canon fit boundary) — the per-speaker re-run applies the
   *  SAME live-window trim the round-level recall did, so a scoped speaker never re-injects a still-verbatim
   *  scene either. Absent ⇒ no prior boundary stamp ⇒ no trim. */
  readonly liveWindowCutoffSeq?: number | undefined;
}

/** The narrow stateful seam between recall and the engine-owned chat bus. Search reports the outage; the
 * engine takes it after `turnStarted`, exactly once for this turn. */
export interface MemoryRecallWarningEpisode {
  readonly reportRerankUnavailable: () => void;
  readonly takeRerankUnavailable: () => boolean;
}

/** A complete, aged-out block of canon (the `blockSize`-message digest/segment unit). `blockIdx` is the
 *  fixed-width index within the chat; the rows are the block's messages oldest→newest. */
export interface BlockSpan {
  readonly blockIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly rows: readonly MsgRow[];
}

/** The three token quantities the summarizer token-guard fits a block against (`build/substrate/token-guard`
 *  `fitBlockToBudget`). Bundled because they are ONE budget read together — the transcript room is
 *  `contextTokens - systemPromptTokens - outputReserveTokens`, and three bare positional numbers at a call
 *  site are silently swappable. `outputReserveTokens` is the SAME `max_tokens` the summarize request sends
 *  (the one-home rule: the caller resolves `AppSettings.memorySummarizer.maxTokens ?? the default reserve`). */
export interface SummarizerBudget {
  readonly contextTokens: number;
  readonly systemPromptTokens: number;
  readonly outputReserveTokens: number;
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

/** The SEGMENT pass's fold — {@link MemoryPassCounts} plus the blocks that could not be CHUNKED into the embed
 *  model's window at all (a block past the pathological ceiling, `MAX_SEGMENT_CHUNKS_PER_BLOCK`). Those are
 *  skipped WHOLE and counted here, never truncated into a vector that claims a seq-span it never read (owner
 *  ruling, #165); an ordinary oversized block is CHUNKED and loses nothing (#172). The count rides the sweep
 *  result + the workload progress copy so a skipped block is a recorded fact, never a silent gap in memory. */
export interface SegmentPassCounts extends MemoryPassCounts {
  readonly skippedOverWindow: number;
}

/** ONE in-budget piece of a verbatim block (#172) — a `chat_segments` row. `chunkIdx` is its position within
 *  the block (0 for the overwhelming majority: one chunk covers the whole block); `(seqStart, seqEnd)` is the
 *  HONEST span of messages the `text` contains — chunks cut at message boundaries, and a single message
 *  bigger than the window yields pieces that all carry that one message's seq. */
export interface SegmentChunk {
  readonly chunkIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly text: string;
}

/** One presence interval of a character in a chat (the join/leave WITNESSING horizon — core/Knowledge-Cluster.md §4 /
 *  inv 12). `joinSeq` = the `messages.seq` at which the character became present; `leftSeq` = the seq at which
 *  it left (exclusive — present for `seq ∈ [joinSeq, leftSeq)`), or `null` when still present. A kick→re-add
 *  yields MULTIPLE intervals (the kicked span stays invisible). Sourced from `chat_participants` by the engine
 *  (or `loadWitnessHorizons`); the build/recall LOGIC takes them as data (determinism — no ambient read). */
export interface WitnessInterval {
  readonly joinSeq: number;
  readonly leftSeq: number | null;
}

/** What `recallMemory` produces: the rendered `{{memory}}` block AND the explanation of how it got there.
 *  ONE return, not a value plus an optional out-param sink — the trace is the reason #250 exists, and a shape
 *  a caller can forget to collect is exactly the hole that let recall run unobserved. `text` is `""` for every
 *  zero-work path (off / empty pool / nothing survived); the slice then carries the REASON. */
export interface MemoryRecallResult {
  readonly text: string;
  readonly trace: MemoryRecallSlice;
}

/** The recall observability RECORD as the bounded ring buffers it — one recall call, stamped with its
 *  monotonic sequence + wall-clock time by the recorder (the emitter supplies neither: determinism, the
 *  `RpgTraceRecord` precedent). */
export interface MemoryRecallRecord {
  readonly seq: number;
  readonly at: number;
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  readonly trace: MemoryRecallSlice;
}

/** The read filter for the ring: narrow to one chat's recalls, and/or the most-recent N. */
export interface MemoryRecallFilter {
  readonly chatId?: ChatId;
  readonly limit?: number;
}

/** The injected recall-trace sink (`ChatContext.recordRecall`) — synchronous, side-effect-only, and it must
 *  never throw into the turn path. Absent ⇒ nothing records (a hand-built ctx / a unit test), and recall is
 *  byte-identical either way. */
export type MemoryRecallSink = (record: Omit<MemoryRecallRecord, "seq" | "at">) => void;

/** The `memoryRecall` bus member itself (#313) — the domain CONSTRUCTS this literal (the `turnStarted`
 *  precedent: `domain/chat/engine` builds its own bus events), so `bus-producer-coverage` finds the emit in
 *  domain scope, not in compose wiring. */
type MemoryRecallBusEvent = Extract<ChatBusEvent, { type: "memoryRecall" }>;

/** The injected recall-PHASE emitter (`ChatContext.emitRecallPhase`, #313) — the live feed the header
 *  brain-icon reflects. Fired at the SINGLE recall convergence (`recall/recall.ts`): `"recalling"` (count
 *  null) the instant recall begins for a turn with memory ON, `"recalled"` (the surfaced count) once it
 *  closes. `recall/recall.ts` builds the `{ type: "memoryRecall", … }` event; compose wires this straight to
 *  the LIVE-ONLY `emitChatEventLive` fan. Synchronous, side-effect-only, never throws into the turn path;
 *  absent (a hand-built ctx / a unit test) ⇒ recall is byte-identical. Memory OFF fires NEITHER phase — an
 *  absent event is the idle icon, never a lying "recalled 0". */
export type MemoryRecallPhaseEmitter = (event: MemoryRecallBusEvent) => void;

/** The compose singleton (`memory/recall/recorder.ts` builds ONE): the injected {@link MemoryRecallSink} plus
 *  the host-only ring read `/api/_debug/memory/recalls` tails. */
export interface MemoryRecallRecorder {
  readonly sink: MemoryRecallSink;
  /** The matching records in chronological order, capped to the most-recent `limit` (default: ring depth). */
  readonly recent: (filter?: MemoryRecallFilter) => readonly MemoryRecallRecord[];
}

/** The per-call build observability fragment (core/Knowledge-Cluster.md §3a `memoryTrace.build`). Folded into
 *  {@link MemoryLogEntry}'s `memory.build` arm — not consumed as a standalone type, so not exported. */
interface MemoryBuildTrace {
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

/** A structured memory observability event (core/Knowledge-Cluster.md §3a — "did memory work this turn, and why" is a
 *  first-class, greppable fact). Discriminated on `event`; `note` carries the zero-work / degrade reason
 *  ("no digests" / "no aged-out block" / "summarizer context below floor").
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export type MemoryLogEntry =
  | {
      readonly event: "memory.recall";
      readonly chatId: ChatId;
      readonly scopedCharacterId: CharacterId;
      /** The SAME slice the assembly trace + the debug ring carry — one recall shape, three readers (#250);
       *  the log fragment is deliberately not a narrower second spelling of it. */
      readonly trace: MemoryRecallSlice;
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

// ── The PD-41 corpus-sweep counts (`substrate/backfill.ts`). These DERIVE `@orb/contracts/chat` rather than
//    re-spelling it: the sweep's fold IS the workload's terminal RESULT — `workload-contributions.ts` returns
//    the value the sweep produced straight through as the contract type, and it lands verbatim in the durable
//    workload result JSON. One home for that shape (contracts, which cannot import a domain), so a field the
//    contracts shape grows can never silently miss this side. The sweep-vocabulary NAMES stay: `substrate/`'s
//    signatures read as counts, not as a workload result. ──

/** One sweep pass's fold: entities visited × rows actually written. */
export type BackfillPassCounts = BackfillPassResult;

/** The memory-backfill sweep result: the segment pass (scanned = chats) + the digest pass (scanned =
 *  scope buckets). `failed` = chats whose build threw an UNEXPECTED error and were isolated-and-skipped
 *  (the sweep survives one bad chat, but the failure is NOT silent — it is logged at `error` level AND
 *  counted here so the workload result surfaces it; #41). A healthy sweep is `failed: 0`; any non-zero
 *  value is a signal to investigate, never a chat silently losing its memory without a trace. NOT exported:
 *  its only reader is {@link MemoryBackfillSweepCounts} below, and the sweep's callers take THAT. Kept as a
 *  named alias rather than inlined because it IS the cite-or-derive receipt the `ast respell` lens reads — a
 *  bare alias naming the contracts symbol is the derive, so this must never become a hand-spelled twin. */
type MemoryBackfillCounts = MemoryBackfillResult;

/** Internal completion evidence consumed by the workload terminal; only checked owner-spaces are listed. */
export type MemoryBackfillSweepCounts = MemoryBackfillCounts & {
  readonly completedSpaces: readonly MemoryEmbedSpace[];
};

/** Resolve a host's effective memory tuning for the PD-41 corpus sweep — the SAME merge the live turn path
 *  applies (`entry/compose/chat.ts resolveMemoryConfig`: `AppSettings.memoryDefaults` ⊕ host
 *  `UserSettings.memory.enabled === false → mode:"off"`), extracted to ONE home so the sweep and the turn
 *  can't drift. Injected into {@link backfillMemory} (NOT `ChatContext` — there is no settings-read op there,
 *  engine.ts header): the sweep resolves it off each chat's HOST and SKIPS a `mode:"off"` host's chats
 *  entirely (D36 opt-out honored on the corpus sweep, not just the live turn — #54). */
export type ResolveBackfillMemoryConfig = (hostUserId: UserId) => Promise<MemoryConfig>;
