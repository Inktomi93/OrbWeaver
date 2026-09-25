// Every verb's non-trivial *Result shape + the engine types that live in contract/ (exported feature types
// live here, never inline on the engine). Most reads return a views.ts read-model; most canon-edits return
// a MessageView; bulk mutators return void — only the other shapes are declared here.

import type {
  AssembleContext,
  AssembledPrompt,
  AssemblySectionRow,
  AssemblySource,
  ChatContentPart,
  GroupConfig,
  MessageView,
  ReactionEmoji,
  SpeakerRef,
  TokenProvenance,
  TurnAbortReason,
  TurnInitiator,
  TurnIntent,
  UserMacroDraws,
  VariantProviderMetadata,
} from "@orb/contracts/chat";
import type { ChatMembership } from "@orb/contracts/identity";
import type { CostDetails, NormalizedFinishReason, ProviderId } from "@orb/contracts/inference";
import type { EffortLevel, UserIntent } from "@orb/contracts/preset";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import type {
  ChatTurnTools,
  GeneratedImage,
  HistoryRole,
  ReasoningContentPart,
  Resolved,
  ResolvedWarning,
  ToolCallInput,
  WireMeta,
  WireTool,
} from "@orb/inference";
import type { AssetId, CharacterId, ChatId, MessageId, ModelId, PersonaId, UserConnectionId, UserId } from "@orb/kit/ids";
import type { MacroRegistry, RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { MemoryConfig, MemoryRecallInputs } from "./memory.ts";
import type { ReactAsCharacterParams, RequestTurnParams } from "./params.ts";
import type { ChatDetail, ChatVariables } from "./views.ts";

// The invite results are wire nodes: their strict schemas are the invite procedures' tRPC output parsers.
export type { CreateInviteResult, RedeemInviteResult, TurnIntent } from "@orb/contracts/chat";

/** The output axis: per-speaker (one message per speaker) vs narrator (one call voices all the seated characters).
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export type GroupOutput = GroupConfig["output"];
/** The card-scope axis: merged (all member cards in one block) vs scoped (own card + egocentric history).
 *  Lives only on the per-speaker arm — narrator is always merged. */
type CardScope = Extract<GroupConfig, { output: "per-speaker" }>["cardScope"];

/** The per-speaker shape axis a group round resolves and threads onto {@link TurnPrep}. Absent means the
 *  single-speaker core's pinned default, so solo stays byte-identical. */
export interface TurnSpeakerShape {
  readonly output: GroupOutput;
  readonly cardScope: CardScope;
  /** The egocentric scoped target; null for merged/narrator/solo. */
  readonly scopedTargetId: CharacterId | null;
  /** The assistant-speaker label SHAPE name-stamps: the speaking character's name (per-speaker) or the
   *  joined-seated-characters name (narrator). */
  readonly speakerName: string;
  /** The active speaker's identity — the per-speaker card selection keys on this. */
  readonly speakerRef: SpeakerRef;
}

const TURN_KINDS = ["send", "swipe", "continue", "generate", "impersonate", "opening", "auto", "force"] as const;
export type TurnKind = (typeof TURN_KINDS)[number];

/** Maps the domain's turn-kind axis to the public bus {@link TurnIntent}. `opening`/`auto`/`force` surface as
 *  their nearest public lifecycle intent. One home — the engine's `turnStarted`/`turnCompleted`/`turnAborted`
 *  emits AND the verb's pre-arbitration `turnAccepted` emit both key on it (never a re-spelled map). */
export const KIND_TO_INTENT: Record<TurnKind, TurnIntent> = {
  send: "send",
  swipe: "swipe",
  continue: "continue",
  generate: "generate",
  impersonate: "impersonate",
  opening: "generate",
  auto: "generate",
  force: "generate",
};

/**
 * The persist mode for a turn's generated output. Absent on a {@link TurnPrep} means new-slot assistant (a
 * fresh assistant slot at maxSeq+1). The belts → turnStarted → pipeline → emit spine is shared across all
 * modes; only the persist step + canon-context truncation differ:
 *   • new-slot — a fresh slot+variant at the canon tail (role assistant or user for impersonate). Context =
 *     the full canon.
 *   • append-variant — swipe/regenerate: append a variant to an existing assistant slot + select it. Context
 *     = the canon up to (excluding) the slot.
 *   • continue — extend the target slot's selected variant in place, snapshotting undo state. Context = the
 *     canon up to and including the slot.
 */
export type TurnPersist =
  | {
      readonly mode: "new-slot";
      readonly role: MessageRole;
      /** The human author for a role:"user" slot (impersonate); null otherwise. */
      readonly authorUserId?: UserId | null | undefined;
      /** The persona voicing a role:"user" slot (impersonate); null otherwise. */
      readonly personaId?: PersonaId | null | undefined;
    }
  | { readonly mode: "append-variant"; readonly targetMessageId: MessageId }
  | { readonly mode: "continue"; readonly targetMessageId: MessageId };

/** A resolved attachment ref: the model-fetchable URL/data-URI plus its MEDIA KIND (#317). The kind is the
 *  ASSET's stored fact (mime `video/*` → `video`; a gif that sniffs animated → `video`, the owner's
 *  gif-as-motion rule; every other image → `image`), classified ONCE at the compose resolver so the
 *  engine's kind-gate (`input.vision` vs `input.video`) and the wire-part constructor agree by
 *  construction. The kind axis is DERIVED from the url-carrying `ChatContentPart` members, never re-spelled
 *  (§5.5). Homed HERE (the D51 seam set) because it derives from the part union. */
export interface ResolvedMediaRef {
  readonly url: string;
  readonly media: Extract<ChatContentPart, { readonly url: string }>["type"];
}

/** One shaped history message handed to the role on the wire. The content is the post-SHAPE text (squash +
 *  name-stamp applied). */
export interface TurnMessage {
  /** `tool` exists only on a materialized tool-exchange row the recurse loop appends; persisted slot roles
   *  never carry it. */
  readonly role: HistoryRole;
  /** The send-path content: a content-part array produced once at the engine request seam by tokenizing
   *  the shaped string body + resolving embedded image refs. A text-only turn is a one-element text part;
   *  a non-vision model never receives image parts. */
  readonly content: readonly ChatContentPart[];
  /** The per-participant label for the `completion` names-behavior, set into the wire `name` field. */
  readonly name?: string | undefined;
  /** The row's wire hints: today a turn-scoped system cue's `clearAt`. */
  readonly wireMeta?: WireMeta | undefined;
}

/**
 * The chat-domain turn request the engine builds and hands to the injected `runChatTurn` role. SDK/
 * provider-free: carries no sessionStore/resume/runner/family. The runner translates this into its sealed
 * request at the boundary.
 */
export interface TurnRequest {
  readonly connection: Resolved<"chat">;
  /** The chat this turn belongs to — the stateful backend keys its resume cache by it. */
  readonly chatId: ChatId;
  /** The static (cache-stable) system prefix + the per-turn dynamic suffix. */
  readonly prompt: AssembledPrompt;
  /** The SHAPE-shaped history (egocentric-scoped, spliced, squashed, name-stamped). */
  readonly history: readonly TurnMessage[];
  readonly intent: UserIntent;
  readonly kind: TurnKind;
  /** The rolling-pair cache breakpoint offset from the tail; null means no safe boundary this round. */
  readonly cacheBreakpointFromEnd: number | null;
  /** The preset's inline-reasoning tag pair, present only when `reasoningParse.autoParse` is ON. The
   *  openai-compat transport uses it to split `<think>` at STREAM time; the engine's own post-hoc split
   *  (`applyReceiveTransforms`) stays for every shape and wire the middleware cannot express, and no-ops
   *  when the wire already produced a reasoning channel. */
  readonly reasoningTags?: { readonly prefix: string; readonly suffix: string } | undefined;
  /** The tools this turn offers, BACKEND-NEUTRAL (D177): the executable set
   *  as definitions + the ONE `execute` callback the pipeline binds to `executeToolCalls`, and the TERMINAL (D112
   *  R1) declarations. How they reach the wire — an MCP server the SDK loops over, or a `tools[]` array the
   *  pipeline's own recurse loop answers — is `@orb/inference`'s `toChatRequest` decision, never this domain's.
   *  Absent on a tool-less turn, so the request stays byte-identical to pre-tools. */
  readonly tools?: ChatTurnTools | undefined;
  /** The structured-output request for this turn (D79) — set by the request-builder gate only when the model
   *  supports it; the runChatTurn translator maps it onto the wire arm's `responseFormat`. */
  readonly responseFormat?: ResponseFormat | undefined;
  readonly signal?: AbortSignal | undefined;
}

/** ONE rendered contribution to a turn's context, attributed to its BUDGET SOURCE — the per-section product
 *  of the BUILD walk (`assemblePromptWithSlices`), grouped into the wire `AssemblyBudgetPreview` by
 *  `assembly/budget`. Domain-internal by design: the WIRE carries the GROUPED six-row shape, never this
 *  per-section stream (a preset with 20 sections would otherwise ship 20 rows the panel can't draw).
 *  `label` is the contributor's own name — a `PromptSection.name`, or the injection-origin label. */
export interface AssemblySlice {
  readonly source: AssemblySource;
  readonly label: string;
  /** The rendered text, exactly as it lands in the prompt half / injection (already macro-resolved). */
  readonly text: string;
  /** The `PromptSection.id` that produced this slice — the join key of the WIRE's per-section partition
   *  (`AssemblyBudgetPreview.sections`, D121-G). ABSENT for a delivered INJECTION: a `chat_injections` row is
   *  not a rack row, so it accounts under its source and belongs to no section (the absence is the fact, never
   *  a placeholder id). */
  readonly sectionId?: string;
}

/** The `history` row of the budget breakdown (`assembly/budget`): the shaped+fitted wire history's COST and
 *  shape, never its content (see `AssemblyBudgetSlice.text`). `keptCount`/`droppedCount` are the FIT's own
 *  verdict, so the row reads exactly as the transcript's context-boundary divider does. */
export interface HistoryBudgetInput {
  readonly usedTokens: number;
  readonly keptCount: number;
  readonly droppedCount: number;
  /** The kept turns, ONE ROW EACH — the history pivot's MATERIALIZED rows on the preset editor's bound Prompt
   *  readout (D121-G: ST's `chatHistory-1 / assistant / 944 tokens` panel, with honest data). Content-free by
   *  construction (label + cost), which is the same posture that keeps `AssemblyBudgetSlice.text` empty for
   *  history: the transcript already renders those bytes, the preview only prices them. */
  readonly rows: readonly AssemblySectionRow[];
}

/** The per-chat macro name producer maps `renderHistoryMacros` needs to resolve a canon-history row's own
 *  macro stamps. Built by the engine after `loadCanonHistory` (the history's distinct ids aren't known in
 *  turn prep). */
export interface HistoryMacroNames {
  readonly characterNamesById: ReadonlyMap<CharacterId, RowCharacterName>;
  readonly personaNamesById: ReadonlyMap<PersonaId, RowPersonaName>;
}

/** The cue replay a prefix-bound model with the `conversation` carry needs: each stored reply's delivered cue
 *  (`message_variants.cue`), keyed by slot, and whether the model takes a cue that follows a user row as a
 *  turn-scoped system row (OR-10 S2) rather than a user row (S2c). */
export interface CueReplay {
  readonly cues: ReadonlyMap<MessageId, string>;
  readonly turnScoped: boolean;
}

/** A streamed chunk from a role turn: text/reasoning deltas, an out-of-band honest-degrade `warning`, then one
 *  terminal final chunk carrying the generation economics.
 *
 *  The `warning` arm is the CHAT role's infra→domain warning hop (D41 no-silent-degrade). The runners raise
 *  resolve/wire drops as infra `WARNING_CODES` on `ChatResult.events`; the compose bridge
 *  (`createRunChatTurnBridge`) carries them here VERBATIM, in the infra vocabulary. Chat owns its own bus
 *  vocabulary and translates at the engine (`toChatWarning`) — the mirror of the IMAGE role's hop, where
 *  compose hands over a narrowed infra code and `verbs/generate-image.ts` re-maps it to a `ChatWarningCode`.
 *  Every infra code has a chat surface as of #1440 — the ten resolve/wire degradations that used to be
 *  dropped there now ride the `settings_adjusted` carrier — and the translation stays exhaustive by
 *  `assertNever`, so a NEW infra code fails `tsc` until someone rules on it.
 *
 *  The warning rides WHOLE (`& ResolvedWarning`), not as a bare code (#1440): the structured half
 *  (`knob`/`appliedBudget`/`appliedEffort`) is the only thing that can tell a user WHICH setting the
 *  provider refused and what it used instead, and re-deriving it in the domain would be inventing a fact
 *  the resolver already knows. `message` rides too — operator prose for the wire-outcome ring, never a
 *  user surface. */
export type TurnStreamChunk =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
  | ({ readonly kind: "warning" } & ResolvedWarning)
  // THE PROVIDER DECLINED. Its own arm rather than a `ResolvedWarning`, because `WARNING_CODES` is the
  // resolve/wire DROP vocabulary — "we asked for X and the provider did Y instead" — and a refusal is not a
  // degrade of our settings but the model's verdict on the request. Payload-free: the refusal's `category` /
  // `explanation` / `fallbackModel` are raw upstream strings the chat bus may not carry (`bus.ts`
  // `provider_refused`), and they already ride the infra `refusal` event into the wire-outcome ring.
  | { readonly kind: "refusal" }
  | { readonly kind: "final"; readonly economics: TurnEconomics };

/** The post-generation economics a role turn reports, folded onto the variant. All optional: a runner that
 *  doesn't report a field leaves it absent, never a fabricated zero. */
export interface TurnEconomics {
  readonly content: string;
  readonly reasoning?: string | null;
  readonly model?: ModelId | null;
  /** ATTRIBUTION (§5.3b): the provider REGISTRY id and the connection row that generated this swipe — both
   *  denormalised onto the variant so a read outlives an edited or deleted connection. */
  readonly provider?: ProviderId | null;
  readonly connectionId?: UserConnectionId | null;
  readonly tokensIn?: number | null;
  readonly tokensOut?: number | null;
  readonly cacheReadTokens?: number | null;
  readonly cacheWriteTokens?: number | null;
  /** The reasoning share of `tokensOut` where the wire reports one (inference audit B5); absent/null otherwise. */
  readonly reasoningTokens?: number | null;
  readonly costUsd?: number | null;
  /** `measured | estimated | unrecorded` — the SAME tuple as token provenance (§5.3c); a subscription's SDK
   *  cost is `estimated`, so a rollup never sums it with a metered provider's invoice. */
  readonly costProvenance?: TokenProvenance | null;
  /** The breakdown behind `costUsd` (the phase split, the BYOK gateway/upstream pair) — persisted as the
   *  `cost_details` sidecar, parsed by `costDetailsSchema` at any read seam (inference audit A4/B8). */
  readonly costDetails?: CostDetails | null;
  /** The model's own reasoning blocks WITH their per-wire provenance (`ChatResult.reasoningParts`, audit A1) —
   *  persisted as `message_variants.reasoning_parts` so the next leg of a tool loop can replay verified
   *  reasoning; absent/null on a turn that reasoned nothing replayable. The read side (the assembly's
   *  re-materialization onto the assistant row) is `carryReasoning`'s (§8.8). */
  readonly reasoningParts?: readonly ReasoningContentPart[] | null;
  readonly contextWindow?: number | null;
  readonly maxOutputTokens?: number | null;
  /** How many MODEL CALLS the backend made for this ONE chat turn (the provider contract's `numTurns` —
   *  the agent-sdk's agentic loop reports more than one whenever tools/structured/terminal channels ride; a plain
   *  single-shot completion reports 1). Renamed at this seam ON PURPOSE: "turn" already means a CHAT turn
   *  in every domain vocabulary, and the two counts are different things.
   *
   *  Its job is to make `tokensOut` READABLE: `tokensOut` is the SUM across those calls while
   *  `maxOutputTokens` is the PER-CALL ceiling, so without the denominator a multi-call turn looks like a
   *  backend ignoring the output cap. Consumed by the
   *  wire-outcome debug ring; absent/null on a runner that reports none. */
  readonly modelCalls?: number | null;
  readonly reasoningEffort?: EffortLevel | null;
  readonly ttftMs?: number | null;
  /** The NORMALIZED reason (`NORMALIZED_FINISH_REASONS`) — every wire folds onto it; the two below are the raw
   *  upstream words kept as OPAQUE provenance (never compared, switched on or joined — §5.3c class 4). */
  readonly finishReason?: NormalizedFinishReason | null;
  readonly stopReason?: string | null;
  readonly terminalReason?: string | null;
  /** The upstream OpenRouter generation handle (`gen-…`) this turn billed under — the cost key,
   *  folded onto the variant. Absent/null on a backend that doesn't surface one (agent-sdk / responses). */
  readonly generationId?: string | null;
  /** The wire-opaque facts the normalized fields above cannot carry, ALREADY narrowed by the runtime to the
   *  closed per-provider union (§5.3c class 3): the ephemeral cache-creation TTL split, the subscription's
   *  warm-spare receipt, OpenRouter's upstream vendor and its pre-fee charge. Persisted under
   *  `message_variants.metadata.providerMetadata`; absent on a provider with no first-party arm. This is
   *  STATS-PLANE provenance and is deliberately NOT projected onto `MessageView` — a history read must not
   *  ship it to every client; a reader that wants it takes its own query. */
  readonly providerMetadata?: VariantProviderMetadata | null;
  /** The reducer-assembled model-emitted calls; the loop pivots on finishReason === "tool" and reads these. */
  readonly toolCalls?: readonly ToolCallInput[] | undefined;
  /** §6.7 INLINE REPLY PICTURES — what a chat model whose `output.modalities ∋ image` emitted BESIDE its
   *  prose this depth, in arrival order, each carrying the reply-text offset it arrived at. Still the raw
   *  provider payload (a data-URI/base64 blob or a provider URL): the bytes are not ours until the engine
   *  materializes them through the SSRF-safe belt and stores them in the host's CAS, which is also the only
   *  moment an `asset:` id exists to spell into the body. Absent on every text-only turn. */
  readonly replyImages?: readonly GeneratedImage[] | undefined;
}

/** §6.7 — the PLACED twin of a `TurnEconomics.replyImages` entry: one picture the engine has already
 *  materialized and stored, ready to become an `![alt](asset:<id>)` span. The `atChars` offset rides
 *  through from the provider's raw reply and is CLAMPED at the splice (`substrate/inline-reply-images`),
 *  because the receive tier rewrites those bytes in between. It lives here rather than beside the splice
 *  because a domain-internal shape's home is `contract/` (`no-inline-domain-interface`). */
export interface PlacedInlineImage {
  readonly assetId: AssetId;
  readonly atChars: number;
}

/**
 * The immutable per-turn context (RESOLVE+GATHER produce it; BUILD+SHAPE take it + a speaker and return a
 * prompt, never mutating it). A per-speaker round re-derives SHAPE off this immutable prep — no shared-ctx
 * mutation.
 */
export interface TurnPrep {
  /** The room this turn runs in — keys the lock, the canon persist, and every bus event. */
  readonly chatId: ChatId;
  readonly assembleContext: AssembleContext;
  readonly connection: Resolved<"chat">;
  /** The initiator who owns attribution and abort. The caller (`Principal.userId`) need not be the initiator. */
  readonly triggeredBy: UserId;
  /** The frozen room host whose connection funds every inference call belonging to this turn. */
  readonly funderUserId: UserId;
  /** The same frozen host as the assembly and tool principal. */
  readonly runAsUserId: UserId;
  /** The turn's origin (the cascade guard's non-human-initiator seam). Absent ⇒
   *  a human turn (`'human'`/depth 0 — the DB column defaults), so every human/character/agent verb stays
   *  byte-identical. An automation `requestTurn` threads `'automation'` + `parentDepth + 1`; the engine
   *  stamps both onto the reply slot (new-slot only — a swipe/continue re-voices nothing), and `getTurnOrigin`
   *  reads them back. NOT a bus-event field (the D19/D50 allowlist). */
  readonly initiator?: TurnInitiator | undefined;
  readonly automationDepth?: number | undefined;
  readonly kind: TurnKind;
  readonly intent: UserIntent;
  /** The host's `UserSettings.chat.customStoppingStrings`, merged into the generation request's
   *  stop set at the pipeline REQUEST seam (never mutating `intent`). Absent/empty ⇒ the request stop is
   *  exactly `intent.stop` — byte-identical to a host who never set custom stops. */
  readonly extraStopSequences?: readonly string[] | undefined;
  /** The resolved host memory config — the same resolution recall reads. Threaded so a host who disabled
   *  memory doesn't pay the summarizer/embed every turn. Absent falls back to the build's baked defaults;
   *  mode:"off" skips the whole build. */
  readonly memoryConfig?: MemoryConfig | null | undefined;
  /** The ROUND-LEVEL recall inputs (gathered once) the engine re-runs `recallMemory` with PER SCOPED SPEAKER —
   *  each real speaker's OWN bucket + its join/leave `witnessing` horizons (D6). Absent / null ⇒ no per-speaker
   *  recall (merged/narrator/solo, memory off, or an empty roster) ⇒ the round-level `assembleContext.memory` stands
   *  byte-identically. Shared across the round's speakers (the recent-window + name-map are speaker-invariant). */
  readonly memoryRecall?: MemoryRecallInputs | null | undefined;
  /** The per-turn user-macro RENDER registry (WAVE MU delivery) — handler CLOSURES capturing this turn's
   *  resolved input bindings, so it is SERVER-ONLY and rides HERE, NEVER on the serializable
   *  `assembleContext` (a client-imported contract shape). Absent ⇒ the preset authored no user macros ⇒
   *  every render seam falls back to the process `globalMacroRegistry` (byte-identical). Shared by reference
   *  across a group round's speakers (one resolution per round). */
  readonly macroRegistry?: MacroRegistry | undefined;
  /** The turn's effective user-macro draw record (frozen ∪ fresh) — resolved ONCE at registry build and
   *  immutable for the round; persisted onto EVERY committed variant (so a swipe of any speaker's row
   *  replays it). Absent ⇒ the turn drew nothing. */
  readonly userMacroDraws?: UserMacroDraws | undefined;
  /** The roster character this single turn voices; null for a non-character turn. */
  readonly speakerCharacterId: CharacterId | null;
  /** A synthetic trailing user turn (regen prompt/continue nudge); null for a plain send. */
  readonly appendUserTurn?: string | null | undefined;
  /** `true` ⇒ {@link TurnPrep.appendUserTurn} exists ONLY because the wire cannot continue the model's own
   *  trailing row — it is the FALLBACK spelling of "keep going", not an instruction the user asked for. The
   *  pipeline DROPS it on a wire that honors assistant prefill, delivering the partial assistant row for the
   *  model to continue instead (which is what a continue means; a trailing `[Continue…]` user row asks for a
   *  NEW message). Set by the `continue` verb alone: an impersonate nudge steers a USER-voiced draft and a
   *  response nudge asks for a REPLY to the last row — neither is a continuation, and both must survive on
   *  every wire. Absent/false ⇒ the tail rides exactly as it always has. */
  readonly appendUserTurnIsContinuationFallback?: boolean | undefined;
  /** The group nudge, set only on a multi-speaker round; null for the single-speaker core. */
  readonly groupNudge?: string | null | undefined;
  /** The union of gather-contributed tool names. Absent/empty means no tools ride, and the loop degenerates
   *  to one runChatTurn call. */
  readonly attachedToolNames?: readonly string[] | undefined;
  /** The TERMINAL wire tools a game turn's gather contributed (R1 — the folded state extraction): mounted on
   *  the wire with `tool_choice:"auto"`, never resolved/executed/recursed on, their co-emitted calls handed
   *  back to the contributor. Threaded ONLY by the PERSISTING lifecycle (`executeTurn`) — a non-persisting
   *  draft (`generateText`, the impersonate composer fill) has no committed slot to fold onto, so it must
   *  never spend the model's attention on state tools. Absent ⇒ byte-identical to today. */
  readonly terminalTools?: readonly WireTool[] | undefined;
  /** The M2 card wire knob a game turn's gather contributed (parity-plus §3.5) — threaded to
   *  `runTurnPipeline.cardKeepLastX`. ABSENT ≠ ZERO: absent ⇒ NO window (a chat with no rpg game contributes
   *  nothing, so every stored card rides the wire whole); `0` ⇒ keep none, every history card collapses to its
   *  stub (an rpg game's own default); `n` ⇒ the newest n ride whole. */
  readonly cardKeepLastX?: number | undefined;
  /** docs/plans/rpg/design.md slot-adjacency verdict: is this turn (re)generating the assistant slot that DIRECTLY
   *  responds to the latest user message? The engine marks the turn dice-eligible (`ctx.rpg.markDicePreRollEligible`)
   *  after minting `turnId` when true, so the player's queued d20 feeds the FIRST skill check of a send /
   *  deferred-drain / swipe-of-that-slot but never a later GM/auto/arbiter round. Absent ⇒ false (ineligible). */
  readonly respondsToLatestUserTurn?: boolean | undefined;
  /** The caller's loaded membership for chat-scoped tool ceilings; absent until a chat-scoped registrant exists. */
  readonly toolMembership?: ChatMembership | undefined;
  /** The chat-level recurse cap; absent means the engine applies the seed default. */
  readonly toolRecurseLimit?: number | undefined;
  /** The per-speaker two-axis SHAPE, set by the group round driver; absent falls back to the single-speaker
   *  core's pinned default. */
  readonly shape?: TurnSpeakerShape | undefined;
  /** The persist mode (see {@link TurnPersist}); absent means new-slot assistant. */
  readonly persist?: TurnPersist | undefined;
  /** Lock-free execution — generate runs concurrent with a locked send. Absent/false means the locked path. */
  readonly lockFree?: boolean | undefined;
  /** The CALLER already emitted `turnAccepted` for this turn — the client's turn slot is OPEN. Only the engine
   *  knows whether `turnStarted` fired, so it owns closing that slot on a PRE-START refusal (lock contention /
   *  consent / budget / a missing persist target): those paths emit `turnAborted` instead of throwing silently,
   *  or the acceptance strands as a stuck Stop button. ABSENT ⇒ nobody opened a slot (the founding `opening`
   *  turn — every other turn-starting verb accepts) ⇒ pre-start refusals stay bus-SILENT exactly as before. */
  readonly slotAccepted?: boolean | undefined;
  /** The caller's abort signal, threaded engine → pipeline → runChatTurn (and → the pre-turn compaction, which
   *  is awaited before dispatch). THIS SIGNAL IS WHAT PROVES A CANCELLATION (#1435): a post-start throw with
   *  the signal SETTLED is `turnAborted(reason:"user"|"stale")` and returns the aborted outcome; with the
   *  signal un-settled it is a fault — `turnAborted(reason:"error")` and a rethrow — however the error is
   *  NAMED. Absent ⇒ nothing can cancel this turn, so every post-start throw is a fault. */
  readonly signal?: AbortSignal | undefined;
}

/**
 * The injected per-turn driver the composition root builds once and hands the verbs. `runTurn` executes the
 * lifecycle shell and resolves with the {@link TurnOutcome}; streaming deltas fan out over the chat bus, not
 * the return value.
 *
 * `generateText` is the NON-PERSISTING sibling: it runs the same assemble→shape→generate half (with the same
 * consent + budget belts a real turn pays) and RETURNS the generated text — acquiring NO lock, writing NO
 * canon slot, emitting NO bus event. It backs the composer-fill flows (guided impersonate drafts the user's
 * next line INTO the composer for review; nothing is committed until the user sends). `onText`, when supplied,
 * receives each TEXT delta AS IT ARRIVES off the generation stream (reasoning deltas excluded) so a caller can
 * stream the generation progressively into the composer; absent ⇒ deltas dropped, only the final text returns.
 */
export interface TurnEngine {
  readonly runTurn: (prep: TurnPrep) => Promise<TurnOutcome>;
  readonly generateText: (prep: TurnPrep, onText?: (text: string) => void) => Promise<GeneratedText>;
}

/** The {@link TurnEngine.generateText} product — the reduced generation, unpersisted. `aborted` is true when
 *  the turn's signal fired mid-generation (the caller cancelled); `text` is then whatever streamed before. */
export interface GeneratedText {
  readonly text: string;
  readonly aborted: boolean;
}

/** The PRINCIPAL-FREE non-human turn op. Built once at the chat
 *  composition root over the same turn deps the human verbs use, then handed to automation's `trigger_turn`
 *  arm + the plugin membrane's `turn.trigger`. Homed here (not on the verb file) per `no-inline-types` — the
 *  op shape is contract surface. See {@link RequestTurnParams} for the four walls it enforces. */
export type RequestTurnOp = (params: RequestTurnParams) => Promise<TurnOutcome>;

/** The verb-level result of a completed (or aborted) turn — the committed message(s) joined to their
 *  selected variant. A per-speaker group round commits several rows. */
export interface TurnOutcome {
  /** Empty when the turn aborted before any commit. */
  readonly messages: readonly MessageView[];
  readonly aborted: boolean;
  readonly abortReason?: TurnAbortReason | undefined;
}

/** The scope of a deferred-turn drain (Part III §5). `all` = the boot reclaim (every chat's queued turns);
 *  `hostUserId` = the host-return drain (only the turns funded by the returning host's box). Neither carries
 *  a `principal` — a drain is system-triggered, and the durable `pending_turns` row IS the authorization
 *  (it was minted by a `send` that already cleared `requireParticipant`). */
export type DrainDeferredTurnsScope = { readonly all: true } | { readonly hostUserId: UserId };

/** `drainDeferredTurns` — how many queued turns RAN (arbitrated + drove a round) vs. were DROPPED (a
 *  re-validation refusal: consent/budget/gone-chat). Both outcomes consume the durable row. */
export interface DrainReport {
  readonly ran: number;
  readonly dropped: number;
}

/** `startChat` — the lazily-created chat (+ roster) and the seeded opening, if any. `opening` is null when
 *  the resolved policy seeded no greeting (`none`, or a founding character with no card greeting). The
 *  `generate` opening + its `openingFailure` DEGRADED-NOT-BROKEN apparatus (START-1) retired with the
 *  creation-time draft carry (D166) — "guide the opening" is
 *  now an ordinary post-creation turn against the real room, so a failed generation is just a failed
 *  turn with the standard toast, never data on a successful `startChat`. */
export interface StartChatResult {
  readonly chat: ChatDetail;
  readonly opening: TurnOutcome | null;
}

/** `forkChat` — the new deep-copied, membership-scoped fork. */
export interface ForkResult {
  readonly chat: ChatDetail;
}

/** `impersonateStream` — ONE text delta yielded by the impersonation stream, appended to the composer as it
 *  arrives (progressive fill). The client accumulates the deltas; the stream completes when the generation
 *  ends (or the caller aborts — the partial text stays in the composer). Nothing is persisted. */
export interface ImpersonateStreamDelta {
  readonly delta: string;
}

/** `compact` — the portable compaction marker produced: the summary text + the seq it covers through, and
 *  whether this call actually rewrote the marker (`false` for an idempotent no-op / an all-hidden span / an
 *  empty generation the caller must surface). */
export interface CompactResult {
  readonly summary: string;
  readonly compactedAtSeq: number;
  readonly updated: boolean;
}

/** `reapTemporaryChats` — how many temporary chats were reaped. */
export interface ReapResult {
  readonly reaped: number;
}

/** `getVariables` — the ChoiceBlock variable map. */
export type VariablesResult = ChatVariables;

/** `reactAsCharacter` (B7/MR5) — the `react` tool's answer, shaped for a MODEL to narrate: every refusal
 *  is `ok:false` with words (errors-as-data — a thrown error would read as a platform fault, and "no
 *  character named that here" is a legality answer the model should route around). `alreadyReacted` names
 *  the idempotent-repeat case; `target` says what the reaction landed on ("the whole message" /
 *  "<name>'s line" / the narrated whole-message degrade for an unmatched `toSpeaker`). */
export type ReactAsCharacterResult =
  | { readonly ok: true; readonly alreadyReacted: boolean; readonly character: string; readonly emoji: ReactionEmoji; readonly target: string }
  | { readonly ok: false; readonly reason: string };

/** The standalone `reactAsCharacter` op (`verbs/reactions.ts::createReactAsCharacter`) — NOT a
 *  `ChatService` member (its one consumer is the composition root's `react` tool definition; see
 *  `contract/params.ts::ReactAsCharacterParams`). */
export type ReactAsCharacterOp = (params: ReactAsCharacterParams) => Promise<ReactAsCharacterResult>;
