// @orb/contracts/chat/assemble — the ASSEMBLE family: slim assembly projections + the per-turn
// `AssembleContext`, the BUILD/SHAPE traces, the context-fit preview, and the positional-injection wire.
// Types only — the producing engine (`assemblePrompt`/`buildAssembleContext`) is `domain/chat`. Slim
// projections (`AssembleCharacter`/`AssemblePersona`/`AssembleWorldEntry`) are re-homed HERE (not imported
// from `contracts/character`/`persona`) so `chat` avoids a `chat → character`/`persona` DAG edge.

import type { CharacterId, MessageId, MessageVariantId, UserId, WorldEntryId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { InjectionPlacement } from "@orb/kit/injection";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { PersonaDescriptionPlacement } from "@orb/kit/persona";
import type { EntryKeyMode, EntryPosition } from "@orb/kit/world-info";
import { z } from "zod";
import type { GenerationType, PromptConfig, UserIntent } from "#preset";
import type { ProseOverrides } from "#prose-slot";
import type { RegexScriptRow } from "#regex";
import type { MemoryRetrievalMode } from "#search";
import type { WorldInfoScope } from "#world-info";
import type { MacroFreezeRecord, UserMacroDraws } from "./messages.ts";
import type { RoomOverrides } from "./metadata.ts";
import type { MessageKind, SpeakerRef } from "./participants.ts";
import { messageRoleSchema } from "./participants.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ASSEMBLE FAMILY — slim assembly projections, NOT re-exports of the full card/persona/entry shapes.
// Types only — the producing engine (`assemblePrompt`/`buildAssembleContext`) is `domain/chat`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The card's Character's-Note-\@-Depth projected onto the assemble characters — spliced into history at a
 *  fixed `depth`/`role`. Re-homed slim HERE (not imported from `contracts/character`) so `chat` avoids a
 *  `chat → character` DAG edge. An empty `prompt` is "no note" at assemble time. */
export interface AssembleDepthNote {
  prompt: string;
  depth: number;
  role?: MessageRole | undefined;
}

/** A roster character projected to the fields the ASSEMBLE stage renders — NOT the full `CharacterCard`.
 *  `systemPrompt`/`postHistoryInstructions`, when present, REPLACE the matching preset section in place. */
export interface AssembleCharacter {
  name: string;
  description: string;
  personality?: string | null;
  scenario?: string | null;
  exampleMessages?: string | null;
  systemPrompt?: string | null;
  postHistoryInstructions?: string | null;
  depthPrompt?: AssembleDepthNote | null;
}

/** The human-side projection for `{{user}}` resolution. Slim, homed HERE (not `contracts/persona`) to
 *  avoid a `chat → persona` DAG edge. `placement` is the resolved description position/inject, computed
 *  once at the composition root. */
export interface AssemblePersona {
  name: string;
  description: string;
  placement?: PersonaDescriptionPlacement;
}

/** A world-info entry projected onto the assembler contract. `inject` (opt-in WI-at-depth) reuses the
 *  SHARED `InjectionPlacement` `{depth, role}` primitive — set ⇒ splices into history instead of the
 *  system half. */
export interface AssembleWorldEntry {
  /** Stable entry id — dedup key + priority tiebreaker (priority DESC, id ASC). */
  id: WorldEntryId;
  content: string;
  scope: WorldInfoScope;
  keys: string[];
  priority: number;
  enabled: boolean;
  /** When true, the entry bypasses the per-turn WI token budget (must-have lore). Absent ⇒ false. */
  ignoreBudget?: boolean;
  /** Where this entry was attached — `character` = card-derived (anchor persona); `chat` = user-attached
   *  (active persona). Drives the dual-persona macro routing. */
  source: "character" | "chat";
  /** Which ALWAYS-scope system-half anchor bucket this joins (ST worldInfoBefore/After). Defaults `before`. */
  position: EntryPosition;
  /** How `keys` compile for the keyword scan — `regex` = the keys ARE patterns (a Character-Card-V3
   *  `use_regex` entry, resolved off the stored metadata). Absent ⇒ `literal` (every key escaped). */
  keyMode?: EntryKeyMode;
  /** WI-at-depth: when set, splice into the chat HISTORY at this placement instead of the system half. */
  inject?: InjectionPlacement | null;
}

/** One positional injection for a turn — a `chat_injections` row OR a WI/section converted at build time.
 *  Position semantics: `before_prompt` PREPENDs to the static system block; `in_static` APPENDs to it;
 *  `in_prompt` APPENDs to the dynamic suffix; `in_chat` splices into history at `depth` (the pipeline owns
 *  the splice). `role` is the canonical `MessageRole` axis (no inline re-spell). */
export interface ChatInjection {
  position: "before_prompt" | "in_static" | "in_prompt" | "in_chat";
  /** Only meaningful when `position === "in_chat"`. 0 = at the tail (just before the new turn). */
  depth: number;
  role: MessageRole;
  content: string;
  /** Priority WITHIN a depth (ST `injection_order`); co-located `in_chat` injections splice DESC. */
  order?: number;
  /** WHICH producer minted this injection — the ONLY thing that distinguishes an at-depth world-info entry
   *  from a host chat-injection once both are `ChatInjection`s in one unified list. Stamped by the producer
   *  (context.ts's candidate builders + the gather's rpg/foreign merge), read by the BUILD walk's per-source
   *  accounting ({@link AssemblyBudgetSlice}). Absent ⇒ a hand-built/legacy injection, accounted `steering`. */
  origin?: ChatInjectionOrigin;
  /** WHO this injection's bytes belong to, when a person is behind them — a roster member's card name (their
   *  at-depth note), a persona's name. Absent ⇒ the origin alone names the contributor (a host chat injection,
   *  the room author's note, the game state block). Display-only provenance for the host budget breakdown:
   *  never rendered into the prompt, never a wire input. */
  originLabel?: string;
}

/** The injection PRODUCER axis (see {@link ChatInjection.origin}) — declared ONCE as a tuple and DERIVED
 *  (§5.5, no inline union re-spell). Not a wire-input axis: `chatInjectionInputSchema` deliberately omits it
 *  (a client never authors provenance — the `user` origin is stamped server-side when the row is mapped). */
export const CHAT_INJECTION_ORIGINS = ["user", "world-info", "persona", "authors-note", "guided", "game-state", "new-chat-marker"] as const;
export type ChatInjectionOrigin = (typeof CHAT_INJECTION_ORIGINS)[number];

/** The four injection positions as a tuple — the ONE runtime home for the `ChatInjection["position"]`
 *  axis (`satisfies` binds it to the interface, so a widened union fails `tsc` here; §5.5 no inline
 *  re-spell). The db carries its OWN tuple checked against the same wire type (schema/chat.ts). */
export const CHAT_INJECTION_POSITIONS = ["before_prompt", "in_static", "in_prompt", "in_chat"] as const satisfies readonly ChatInjection["position"][];

/** The `setChatInjection` wire INPUT — the `ChatInjection` fields a client authors + the optional `id`
 *  (present ⇒ update; absent ⇒ create). `chatId`/`principal` are added at the transport edge (the router
 *  extends this), never here. Derived-checked: `satisfies` (below) proves the inferred shape matches the
 *  domain `SetChatInjectionParams` slice, so a params reshape breaks HERE, not silently at the boundary. */
export const chatInjectionInputSchema = z.object({
  id: typeIdSchema(ID_PREFIX.chatInjection).optional(),
  position: z.enum(CHAT_INJECTION_POSITIONS),
  depth: z.number().int(),
  role: messageRoleSchema,
  content: z.string(),
  order: z.number().int().optional(),
});
export type ChatInjectionInput = z.infer<typeof chatInjectionInputSchema>;

/** WHY one pooled memory block did (or did not) reach this turn's `{{memory}}` — the verdict axis of
 *  {@link MemoryRecallCandidate}. Declared ONCE as a tuple and DERIVED (§5.5, no inline union re-spell).
 *  The arms follow the recall pipeline's own order of elimination (`domain/chat/memory/recall/recall.ts`):
 *   • `unwitnessed`    — the speaker was absent for the block's span (a character cannot recall a scene it
 *                        wasn't in); dropped before any mode dispatch;
 *   • `live-window`    — the block's scene is still VERBATIM in this turn's history window, so re-injecting
 *                        its digest would say the same thing twice;
 *   • `mode-excluded`  — the pool survivor is not eligible in the active mode (mixA takes tier-0 only);
 *   • `bridge-covered` — a HIGHER-tier consolidation already covers this block, so the tiered bridge passed
 *                        the parent instead and this one never became a retrieval candidate;
 *   • `below-floor`    — it WAS scanned as a candidate and did not survive the retrieval cut (the `minScore`
 *                        floor, or the mixC rerank trim). Carries no score by construction: retrieval returns
 *                        its SURVIVORS, so the score of a rejected candidate is not knowable here;
 *   • `admitted`       — it made the block, and carries the `score`/`relevance`/`rank` it made it with. */
export const MEMORY_RECALL_VERDICTS = ["admitted", "below-floor", "bridge-covered", "mode-excluded", "live-window", "unwitnessed"] as const;
export type MemoryRecallVerdict = (typeof MEMORY_RECALL_VERDICTS)[number];

/** ONE memory block considered for this turn's `{{memory}}` (`MemoryRecallSlice.candidates`) — the block's
 *  identity, its verdict, and (when admitted) the numbers it was admitted on. CONTENT-FREE by construction:
 *  the digest's own text is never here — the recalled bytes ride the assembled prompt itself, where the D22
 *  host gate already governs them (the {@link ShapeTraceRow} posture). */
export interface MemoryRecallCandidate {
  /** The consolidation tier the block lives at (0 = a lived scene; higher = a consolidation over `fanOut^tier`
   *  tier-0 blocks). */
  tier: number;
  blockIdx: number;
  /** WHOSE egocentric bucket the block belongs to — the shared synthetic group character, or a seated character
   *  under scoped recall (the two buckets the mode-switch union reads). */
  scopedCharacterId: CharacterId;
  verdict: MemoryRecallVerdict;
  /** The CSLS rank signal retrieval admitted it on (LOWER = closer). ABSENT unless `verdict === "admitted"` in
   *  an embedding mode — a pure-assembly mode (mixA/tiered) runs no scan and therefore produces no score. */
  score?: number;
  /** Cosine `1 − distance`, HIGHER = closer — the readout number a surface prints. Same absence rule as
   *  {@link MemoryRecallCandidate.score}. */
  relevance?: number;
  /** 0-based position in the RETRIEVAL-admitted order (best-scoring first — the order this trace lists the
   *  admitted candidates). NOTE (#330 P7): the `{{memory}}` TEXT itself renders the embedding-mode (mixB/mixC)
   *  blocks in CHRONOLOGICAL order for prompt readability, so this rank is the retrieval placement, not the
   *  text position; the pure-assembly modes (mixA/tiered) are chronological in both. ABSENT for every
   *  non-admitted verdict. */
  rank?: number;
}

/** WHAT `{{memory}}` FETCHED THIS TURN AND WHY (`AssembleTrace.memoryRecall`, #250) — the recall subsystem's
 *  slice of the assembly trace, produced by `domain/chat/memory/recall/recall.ts` on EVERY recall call
 *  (including the early returns: a `mode: "off"` / empty-pool turn produces a slice saying exactly that,
 *  because "memory did nothing" is the answer a reader is most often hunting).
 *
 *  `candidates` is deliberately NOT the whole pool: every ADMITTED block is present, plus a bounded head of
 *  the rejected ones (`MEMORY_RECALL_REJECTS_SHOWN`) in pool order — a long chat's pool runs to hundreds of
 *  blocks, and this shape rides a per-turn trace + a bounded debug ring. The COUNTS (`poolSize`,
 *  `candidateCount`, `surfaced`) are always exact, so a truncated candidate list can never be mistaken for a
 *  small pool.
 *
 *  `queryText` is the assembled egocentric retrieval query — RP-derived text, and the ONE datum that answers
 *  "why did it match that": it is served here because every consumer of {@link AssembleTrace} is already
 *  host-gated and already serves the assembled prompt itself (`AssemblyBudgetSlice.text`). Null for the
 *  non-embedding modes, which build no query. */
export interface MemoryRecallSlice {
  mode: MemoryRetrievalMode;
  queryText: string | null;
  /** Whether the per-turn query embed actually fired (false for off / empty pool / the pure-assembly modes). */
  queryEmbedded: boolean;
  /** Blocks in the witnessed, live-window-filtered pool — the universe this recall chose from. */
  poolSize: number;
  /** Blocks the tiered bridge passed to retrieval as candidates (= `poolSize` minus the bridge-covered). */
  candidateCount: number;
  /** Blocks that actually reached the rendered `{{memory}}` block. */
  surfaced: number;
  /** Wall time of the whole recall, from the injected clock. */
  ms: number;
  /** The zero-work / degrade reason ("mode off", "no digests"), else null. */
  note: string | null;
  candidates: readonly MemoryRecallCandidate[];
}

/** How many REJECTED candidates a {@link MemoryRecallSlice} carries beside the admitted set. A bound, not a
 *  policy: the admitted blocks are always all present, and the counts stay exact. */
export const MEMORY_RECALL_REJECTS_SHOWN = 12;

/** Debug metadata about what assembly did — NOT the prompt text. Answers "why did/didn't this fire?"
 *  without dumping RP content (the host/admin-only trace surface). */
export interface AssembleTrace {
  staticSections: string[];
  dynamicSections: string[];
  /** WORLD-INFO entries that survived the budget pass this turn (= `worldInfoActivated.length`). It is NOT a
   *  count of delivered injections: the injection list also carries user/guided/persona/author's-note/
   *  new-chat-marker candidates, and counting those reported lore on a chat with no books attached. */
  worldInfoIncluded: number;
  worldInfoDropped: { id: string; reason: "budget" }[];
  /** The WI entries that actually FIRED into this turn's prompt — the budget-survived pool by entry IDENTITY
   *  (not `matchedKeys`, which is keyword strings). `keys` is the entry's keyword list ([] for an always-scope
   *  entry); the host inspector lists these so a human can see WHICH lore the model saw. Empty ⇒ no WI fired. */
  worldInfoActivated: { id: string; keys: string[] }[];
  matchedKeys: { key: string; matchedLatestUserMessage: boolean }[];
  compactSummaryIncluded: boolean;
  memoryIncluded: boolean;
  /** WHAT memory fetched and why (#250) — the recall subsystem's slice, present whenever recall RAN this
   *  turn. `null` is the honest "no recall was performed": a hand-built / preview / non-chat assembly that
   *  never called the subsystem at all, which is a different fact from `memoryIncluded: false` (recall ran
   *  and the marker still delivered nothing). */
  memoryRecall: MemoryRecallSlice | null;
  /** Whether the `{{databank}}` slot actually delivered retrieved document text this turn (DB6). Distinct from
   *  "documents are attached": a chat with a full bank still reads false when the active preset places no
   *  databank section, which is exactly the invisible failure issue #80 was. */
  databankIncluded: boolean;
  guidedInstructionIncluded: boolean;
  /** Volatile macros that landed in the STATIC half — each busts prompt cache every turn. */
  staticCacheBusters: string[];
  chatInjectionsIncluded: number;
  afterHistorySections: string[];
  /** Resolved source of each room-overrideable field ("room override" / "from <Name>" / "merged"). */
  overrideSources?: {
    mainPrompt?: string;
    postHistory?: string;
    scenario?: string;
    authorsNote?: string;
  };
  /** Roster members whose contribution to a MERGED room-override fallback (the `{{original}}` a room override
   *  inherits, for `main_prompt` / `post_history`) was CUT to fit the concatenation cap, by name and by field.
   *  The merged fallback is a hard-capped join, so a member's card prose can be shortened — or, before the
   *  per-member allocation, dropped entirely behind a long earlier member — while `overrideSources` said only
   *  "merged (present characters)". Absent ⇒ nothing was cut, which is the overwhelming case. */
  mergedFallbackTruncated?: {
    mainPrompt?: string[];
    postHistory?: string[];
  };
}

/** The context-BUDGET source axis — the six buckets every byte of a next-turn context lands in (the Preview
 *  tab's per-source accounting). Declared ONCE as a tuple and DERIVED (§5.5); the order IS prompt order, which
 *  is also the stacked bar's segment order and the client's colour-ramp keying. `history` is the shaped wire
 *  history (SHAPE + FIT), every other member is a BUILD-walk contribution. */
export const ASSEMBLY_SOURCES = ["system", "cards", "world-info", "steering", "game-state", "history"] as const;
export type AssemblySource = (typeof ASSEMBLY_SOURCES)[number];

/** ONE CONTRIBUTOR's share of a source (`AssemblyBudgetSlice.parts`) — a roster member by their card name, a
 *  persona, or a preset section by its own name. This is what answers "what is EACH character in the room
 *  costing me", so `label` is a person's name wherever a person is behind the bytes. */
export interface AssemblyBudgetPart {
  label: string;
  tokens: number;
  /** This contributor's assembled text, verbatim. Empty only where the source itself carries none (history). */
  text: string;
}

/** ONE source's slice of the next turn's estimated context (`AssemblyBudgetPreview.sources`). `tokens` is the
 *  LOCAL estimate (`@orb/kit/tokens` QuadChars — the same estimator the history fit runs), never billing truth. */
export interface AssemblyBudgetSlice {
  source: AssemblySource;
  /** The contributors that make up this slice, deduped in prompt order ("Mara · Niko · Sera"), or the history
   *  row's "N turns · M dropped". Empty string ⇒ nothing to add beyond the source name. Derived from
   *  {@link AssemblyBudgetSlice.parts} — the same names, as one line. */
  detail: string;
  tokens: number;
  /** The per-contributor breakdown, in prompt order and summing to `tokens`. One entry ⇒ the source has a
   *  single contributor (the row's own drill-in is enough); several ⇒ the panel lists them (the room's
   *  characters and what each costs). Empty ONLY for `history` (no contributor split exists — see `text`). */
  parts: readonly AssemblyBudgetPart[];
  /** The assembled text attributed to this source — the drill-in body, verbatim as the model receives it.
   *  EMPTY for `history` BY CONSTRUCTION: the wire history is canon the transcript already renders, so the
   *  preview accounts for its COST without re-serving it (the same content-free posture as {@link ShapeTrace}). */
  text: string;
}

/** ONE MATERIALIZED ROW inside a prompt section (`AssemblySectionCost.rows`) — ST's inspect panel with honest
 *  data (D121-G / preset-surface-redesign §7.1): the rows a marker actually expanded into against a live room.
 *  A merged card section splits per roster member; the history pivot splits per kept wire turn; every other
 *  section is its own single row. CONTENT-FREE by construction — the label + the cost, never the bytes (the
 *  bytes ride `AssemblyBudgetSlice.text`, where the D22 host gate already governs them). */
export interface AssemblySectionRow {
  /** Who/what this row is — a roster member's name, a wire turn's speaker name or role, else the section's own
   *  contributor label. */
  label: string;
  tokens: number;
}

/** ONE PROMPT SECTION's true cost against a live chat (`AssemblyBudgetPreview.sections`) — the preset editor's
 *  BOUND Prompt readout (D121-G): the rack row's real price, which the editor cannot know chat-free (a CARRIER
 *  reads `~—` unbound precisely because its substance is the conversation's).
 *
 *  Keyed by `PromptSection.id`, so the readout joins it straight onto the rack it already draws. Sections that
 *  rendered NOTHING this turn are OMITTED — bound-and-absent means "contributes nothing", which is a fact,
 *  unlike the unbound `~—` (which means "not knowable here"). `tokens` is estimated over the section's JOINED
 *  rendered text, so `Σ rows` can differ by a token or two of rounding — the rows answer "what makes this up",
 *  the section answers "what does this row cost" (the {@link AssemblyBudgetSlice} posture). */
export interface AssemblySectionCost {
  /** The `PromptSection.id` this cost belongs to. */
  sectionId: string;
  tokens: number;
  /** The materialization breakdown, in prompt order. NEVER empty — a single-contributor section is one row. */
  rows: readonly AssemblySectionRow[];
}

/** The next turn's context accounting (`previewAssembly`) — the stacked budget bar + its per-source breakdown.
 *  `ceilingTokens` = the SAME `min(capability window, preset maxContextTokens)` the engine's history fit uses,
 *  `0` ⇒ unbounded (no capability window and no soft cap — the bar then renders proportions with no ratio).
 *  `totalTokens` = Σ `sources[].tokens`, so the segments always partition the bar exactly. */
export interface AssemblyBudgetPreview {
  ceilingTokens: number;
  /** The ceiling is a FALLBACK GUESS, not the connected model's published window (see
   *  `ModelCapability.context.windowEstimated` — an OR catalog that could not be fetched, a BYO endpoint that
   *  declared no window). The FIT still runs against it (we never trim blind), but a surface MUST NOT present
   *  it as a real denominator: show the used total and say the window is unknown (D41 no-silent-degrade). */
  ceilingEstimated: boolean;
  totalTokens: number;
  /** Prompt-ordered, EMPTY sources omitted — a plain (non-game) chat carries no `game-state` row. */
  sources: readonly AssemblyBudgetSlice[];
  /** The SAME bytes, partitioned by PROMPT SECTION instead of by source (D121-G): the preset editor's bound
   *  Prompt readout prices its rack rows off this, while the chat Preview tab reads `sources`. One read, two
   *  projections (§7.1) — rack order, sections that rendered nothing omitted. */
  sections: readonly AssemblySectionCost[];
}

/** Why SHAPE did/didn't place the §8 cache breakpoint — the abort taxonomy, content-free. Declared ONCE as
 *  a tuple and DERIVED (no inline-union re-spell; §5.5). The server builder (`chat/assembly/trace.ts`) labels
 *  the outcome; the host inspector renders it. */
export const SHAPE_BREAKPOINT_DECISIONS = ["placed", "no-stable-prefix", "in-prefix-injection-or-squash"] as const;
export type ShapeBreakpointDecision = (typeof SHAPE_BREAKPOINT_DECISIONS)[number];

/** WHERE one delivered wire row's bytes came from — the provenance axis of {@link ShapeTraceRow}. Declared
 *  ONCE as a tuple and DERIVED (§5.5). Resolved from the SHAPE-internal `messageId` discriminator (a canon row
 *  carries the id of the message it was loaded from; a spliced injection and a synthetic nudge are id-less by
 *  construction — the same distinction `resolveFullCards` reads):
 *   • `canon`     — every contributing row is a stored message;
 *   • `assembled` — every contributing row was produced for THIS turn and is stored nowhere: a spliced
 *                   `in_chat` injection, the group/continuation nudge, or the synthetic user turn a
 *                   regen/continue appends. Deliberately NOT called "injected" — the nudge and the synthetic
 *                   turn are not injections, and naming the arm after one of its three producers would be a
 *                   surface that lies about the other two;
 *   • `merged`    — the adjacent-same-role squash folded BOTH kinds into one delivered row. Its own arm rather
 *                   than reporting as `canon`, because that fold is exactly the INJECT-NAMED-AS-PLAYER shape (a
 *                   demoted system note absorbed into the player's turn) and calling it canon would hide it. */
export const SHAPE_ROW_SOURCES = ["canon", "assembled", "merged"] as const;
export type ShapeRowSource = (typeof SHAPE_ROW_SOURCES)[number];

/** WHY a system-role row reached the wire as user text instead of a real `system` row — the fold axis of
 *  {@link ShapeTraceRow}:
 *   • `level`     — the turn's message-handling level folds every system row (`semi-strict`, `strict`);
 *   • `slot`      — the level keeps a system run only in its legal slot, and this run sat outside it (the row
 *                   before is not a user row, or the row after is not an assistant row);
 *   • `tail`      — the run ended the history, and the model takes no system row there
 *                   (`turns.midConversationSystem`);
 *   • `mid-array` — the run sat inside the history, and the model takes no system row there
 *                   (`turns.historySystemRows`). */
export const SHAPE_FOLD_REASONS = ["level", "slot", "tail", "mid-array"] as const;
export type ShapeFoldReason = (typeof SHAPE_FOLD_REASONS)[number];

/** ONE DELIVERED WIRE ROW, content-FREE (`ShapeTrace.rows`) — the ordered projection of the history the model
 *  actually receives. The stage COUNTS beside it say how many rows each stage held; this says WHICH rows, in
 *  what order, in whose voice. Roles, speaker labels, provenance and a character COUNT only — never the bytes
 *  (the same posture as the rest of {@link ShapeTrace}; the bytes are `AssemblyBudgetSlice.text`, where the
 *  D22 host gate already governs them).
 *
 *  PRE-FIT by construction: SHAPE runs before the context fit, so a row here can still be trimmed by the
 *  window (the fit's verdict is `AssemblyBudgetSlice.detail`'s "N turns · M dropped"). */
export interface ShapeTraceRow {
  role: MessageRole;
  /** The speaker label this row carries — the `completion` names-behavior's out-of-band `name`, or the
   *  in-content `Name:` stamp's author. ABSENT ⇒ the row is unlabelled (a system note, a nudge). */
  name?: string;
  source: ShapeRowSource;
  /** The DECLARED purpose (`messages.kind`) of the canon row(s) that became this delivered row — the row-PURPOSE
   *  axis a host reading the trace otherwise has to infer from role × attribution, which is the inference D129
   *  retires. ABSENT ⇒ no canon row contributed one: an `assembled` row (a spliced injection, the nudge, the
   *  synthetic user turn) has no slot and therefore no declared purpose. A `merged` row reports the FIRST
   *  contributor that carried one — the same head-identity rule {@link ShapeTraceRow.name} follows. */
  kind?: MessageKind;
  /** The delivered content's LENGTH in characters. A size, not a sample. */
  chars: number;
  /** Present ⇒ a system-role row folded into this user row, and why. A merged row reports its first fold. */
  folded?: ShapeFoldReason;
}

/** The content-free SHAPE-stage trace (`buildShapeTrace`) — the debug projection of how a turn's canon was
 *  shaped into the wire history, safe to show in the host/admin inspector: per-stage ROW COUNTS (never any
 *  content), the squash-merge count, and the cache-breakpoint decision. The SHAPE-phase companion to
 *  {@link AssembleTrace} (BUILD phase); like it, it answers "why did this happen?" without dumping RP text. */
export interface ShapeTrace {
  multiCharacter: boolean;
  /** Row counts per SHAPE stage (no content). `injected − squashed` = how many adjacent same-role merges fired. */
  stageCounts: {
    withTail: number;
    injected: number;
    squashed: number;
    named: number;
  };
  /** Adjacent same-role merges the squash performed (a non-zero count flags a boundary the breakpoint math
   *  must be conservative around). */
  squashMerges: number;
  /** The pinned cache breakpoint's DEPTH, in role groups from the end (the runner's own counter, where a system
   *  row is transparent); ABSENT when none was placed (the `placed` decision carries it, every other decision
   *  omits it). */
  cacheBreakpointFromEnd?: number;
  breakpointDecision: ShapeBreakpointDecision;
  /** The DELIVERED wire history in order (post-nudge, pre-fit), one entry per row. The block-order/role datum
   *  a host previously reconstructed by hand from wire captures. Empty ⇒ the turn delivers no history rows. */
  rows: readonly ShapeTraceRow[];
}

/** The present-tense context-fit budget for a chat's CURRENT canon against the host's effective preset +
 *  resolved capability — the source the transcript's context-boundary divider reads so the line tracks knob
 *  changes live (PD-#7). Computed by the SAME `fitHistoryToWindow` + kit estimator the engine's turn pipeline
 *  runs, so `boundaryMessageId` equals the `contextBoundaryMessageId` the next real turn would stamp on canon.
 *  `boundaryMessageId` is the earliest KEPT message id (null = everything fits / no id-bearing kept row).
 *  `usedTokens` = the kept history's estimated cost; `ceilingTokens` = min(window, maxContextTokens);
 *  `reserveOutputTokens` = the materialized output reserve; `droppedCount` = oldest turns trimmed. */
export interface ContextFitPreview {
  boundaryMessageId: MessageId | null;
  usedTokens: number;
  ceilingTokens: number;
  /** The ceiling is a fallback GUESS rather than the connected model's published window — see
   *  {@link AssemblyBudgetPreview.ceilingEstimated}. Any "N of M used" line must say so. */
  ceilingEstimated: boolean;
  reserveOutputTokens: number;
  droppedCount: number;
  /** The chat's LINEAR-tier compaction summary (`chats.compactSummary`) when it covers the span ABOVE the fit
   *  boundary — the divider then reports that older messages are compacted into a summary + offers a peek at this
   *  text. `null` when no summary exists OR its checkpoint hasn't reached the boundary (nothing above the
   *  divider is compacted yet). Member-safe: the summary is built from prompt-eligible rows only (hidden rows
   *  are excluded at compaction), so peeking it never leaks another member's hidden content. */
  compactSummary: string | null;
}

/** The product of the BUILD stage. `static` is the cache-stable prefix; `dynamic` the per-turn suffix;
 *  `afterHistory` the sections that splice into history as `in_chat` injections. Consumed by a
 *  `message_variants.promptSnapshot` (D26). */
export interface AssembledPrompt {
  static: string;
  dynamic: string;
  afterHistory: ChatInjection[];
  /** `false` only when a `chat_history` marker is present AND disabled (absent ⇒ true). */
  sendHistory: boolean;
  trace: AssembleTrace;
}

/**
 * The SENT-PROMPT projection of a stored {@link AssembledPrompt} — the `message_variants.promptSnapshot` blob
 * as the host inspector serves it. Deliberately a PROJECTION, not the whole node: the bytes that went on the
 * wire (`static`/`dynamic`/`afterHistory`/`sendHistory`) and nothing else. `trace` is dropped — the Preview
 * tab already renders a live `AssembleTrace`, and re-serving a stored one would widen a host-only payload for
 * a readout that already exists.
 *
 * It is also the READ-SEAM PARSER for that column: `promptSnapshot` is untyped JSON at rest (`$type<>` is a
 * compile-time claim, not a runtime one), so the wire read `safeParse`s through this instead of casting. A
 * blob that fails degrades to `null` — an honest "nothing captured", never a throw or a half-typed object.
 * The `position`/`role` axes DERIVE their canonical tuples (§5.5, no inline re-spell).
 */
export const sentPromptSchema = z.object({
  static: z.string(),
  dynamic: z.string(),
  sendHistory: z.boolean(),
  afterHistory: z.array(
    z.object({
      position: z.enum(CHAT_INJECTION_POSITIONS),
      depth: z.number().int(),
      role: messageRoleSchema,
      content: z.string(),
    }),
  ),
});
export type SentPrompt = z.infer<typeof sentPromptSchema>;

/**
 * The per-variant WIRE RECORD — what one generation ACTUALLY sent, read back off
 * `message_variants.promptSnapshot`/`params`/`macroDraws` (D26). The retrospective twin of the `peekPrompt`
 * family: `peekPrompt` renders the NEXT turn, this returns the bytes a PAST turn already sent.
 *
 * HOST-ONLY MATERIAL — the payload is deliberately DISJOINT from the member-visible `MessageView` (no
 * content/model/tokens/toolCalls re-served here; a member already has those). Every field below is
 * host-plane by §3.6:
 *  • `prompt` is the assembled prompt, and the wire projection rides hidden spans VERBATIM (the model always
 *    reads them, `domain/chat/substrate/member-visibility` "WHO SEES WHAT"), plus every roster card at FULL
 *    fidelity (bypassing the D22 `memberCardVisibility` clamp), plus the whole assembled history — including
 *    slots below a clamped member's D16 floor. Same rationale that makes `previewAssembly`/`peekPrompt`/
 *    `previewSection` host-gated; the producing verb gates identically (`requireHost`, matrix `host`).
 *  • `params`/`macroDraws` are the host's own generation knobs + the frozen per-turn random draws.
 *  • `rawContent`/`macroFreezes` are the D129-F freeze provenance — the pre-transform authored text and the
 *    volatile occurrences the commit baked. HOST-PLANE, and THIS view is the only surface that serves them
 *    (never `MessageView`): the receive transforms exist partly to STRIP content, so pre-strip bytes reaching
 *    a member would re-open the D110 §3.6 class. `rawContent: null` means NO DISTINCT pre-transform text is
 *    served here — nothing transformed the body, a later content write invalidated the provenance, or the
 *    fork strip removed it — never "the authored text was identical" (the writer's rule, canon-write.ts).
 *
 * A null `prompt` is HONEST ABSENCE, never an error: a user/system row never generated, and a variant
 * committed by a verbatim/greeting seed carries none. The raw PROVIDER envelopes are NOT here — those live
 * only in the ephemeral debug ring (`WIRE_CAPTURE`, `foundation/observability/debug/wire-capture`), never the DB.
 */
export interface VariantWireView {
  variantId: MessageVariantId;
  prompt: SentPrompt | null;
  params: UserIntent | null;
  macroDraws: UserMacroDraws | null;
  rawContent: string | null;
  macroFreezes: MacroFreezeRecord | null;
}

/** The immutable per-turn context (RESOLVE + GATHER produce it; BUILD + SHAPE take it + a speaker). Most
 *  fields are optional so hand-built / preview / solo contexts degrade to byte-identical output (the §10.4
 *  degenerate-case doctrine: solo is the trivial roster, never an `if(isGroup)` branch). */
export interface AssembleContext {
  /** The active/primary character for this turn. */
  character: AssembleCharacter;
  /** The resolved generation config the BUILD walk renders against (the reorderable section model). The
   *  `chat → preset` edge (DAG §1): assembly always builds against a `PromptConfig`. */
  promptConfig: PromptConfig;
  /** All character members (primary first). A roster-of-one solo chat is exactly `[character]`. */
  characters?: AssembleCharacter[];
  /** Per-seated-character character id, index-aligned with `characters`. Null for a non-character slot — an AGENT seat
   *  (D60; its own card is its resolved soul, it has no characterId) or a hand-built/legacy member. */
  characterIds?: (CharacterId | null)[];
  /** Per-seated-character SPEAKER identity, index-aligned with `characters` (D60) — a `character` or an `agent` (whose
   *  card is its resolved soul). The per-speaker card selection (`shape(ctx, speaker)`) keys on THIS to pick
   *  the active member + the co-speakers; a character-only room's refs are all `{kind:'character'}`. Absent ⇒
   *  a hand-built/legacy ctx (the per-speaker shape falls back to the primary — byte-identical). */
  speakerRefs?: SpeakerRef[];
  /** The non-muted CHARACTER subset of `characters` — drives `{{groupNotMuted}}`. Character-only by owner ruling:
   *  the `{{group}}`-family macros never list agent seats (an agent voices via the seated characters, but is not a name in
   *  these lists). Absent ⇒ falls back to the full seated CHARACTER set (the macro layer re-derives it). */
  unmutedCharacters?: AssembleCharacter[];
  /** Who is generating, and so what the system block names: `single` (a scoped turn, `{{char}}` = that
   *  character), `multi-voice` (narrator: one call voices all the seated characters) or `roster` (a per-speaker
   *  merged turn: one call voices ONE member, but the system block is the whole roster in fixed order and names no
   *  speaker — the round cue does). On both roster arms `{{char}}` = all the seated characters, joined, so a room
   *  of one binds that one name. Solo is always `single`. PRODUCED by the card shape
   *  (`assembly/speaker-card`), which dispatches on the round's `output` axis — a narrator round's authoring
   *  speaker is the SYNTHETIC group character and is deliberately NOT in `speakerRefs`, so this arm can never
   *  be derived from the ref. `active` is the member whose card fills the character section (the primary);
   *  the rest ride as `coSpeakers`. */
  speaker?:
    | { kind: "single"; character: AssembleCharacter }
    | { kind: "multi-voice"; members: AssembleCharacter[]; active: AssembleCharacter }
    | { kind: "roster"; members: AssembleCharacter[]; active: AssembleCharacter };
  /** Other present characters whose cards merge into THIS turn's character section — every non-primary member
   *  under a `roster` or NARRATOR layout, in roster order. Each block opens with the `chat.group.characterHeading`
   *  frame. */
  coSpeakers?: AssembleCharacter[] | undefined;
  /** The turn's model-facing prose overrides (PROSE-1 §4.3) — the ROOM HOST's user-tier blob and the
   *  resolved PRESET's blob, composed by home at `buildAssembleContext` (`composeProse`; disjoint by the
   *  one-home law, so this stays a two-rung resolution and never a cascade). The BUILD walk + SHAPE splice
   *  read the frames they compose (the merged co-speaker headings, the two injection note frames, the group
   *  round nudge, the continuation cue) through it.
   *  Absent ⇒ `{}` ⇒ every frame is its shipped default, byte-identical — which is what keeps the ~50
   *  hand-built assemble contexts (tests, previews) honest without threading anything. */
  prose?: ProseOverrides | undefined;
  /** Host-level per-room overrides (`room > card > preset`). Absent ⇒ no room tier. */
  roomOverrides?: RoomOverrides;
  /** Resolved source of the author's-note depth injection ("room override" / "from <Name>"). */
  authorsNoteSource?: string;
  /** `{{user}}` in CARD-derived sections — the chat-open ("anchor") persona. */
  pinnedPersona?: AssemblePersona | null;
  /** `{{user}}` in USER-authored sections and SHAPE's `speakers.user` — the room's anchor human's current seat
   *  persona (the trigger's only on an impersonate draft), so the cached prompt does not depend on who pressed
   *  send. */
  activePersona?: AssemblePersona | null;
  /** WHOSE persona {@link AssembleContext.activePersona} is. It exists for ONE rule, in SHAPE: a canon user row
   *  carrying NO persona stamp may borrow the `{{user}}` name only when the row is that same human's OWN row;
   *  every other null-stamped row floors to the unresolvable-persona name instead of wearing a stranger's
   *  identity on the wire. This is the server twin of the client's fail-closed render rule
   *  (`client/features/chat/lib/attribution.ts` `resolveUserAttribution` — the `authorUserId === viewerUserId`
   *  gate). Null/absent (any hand-built ctx) ⇒ NO row borrows it, which is the fail-closed side. */
  activePersonaUserId?: UserId | null | undefined;
  /** True when the room seats more than one present human. SHAPE then labels every canon user row, so no
   *  row's label depends on who pressed send. Absent ⇒ a solo room. */
  multiHuman?: boolean | undefined;
  /** Whether the `persona` marker should emit the active persona's description (false ⇒ it rode an
   *  injection; marker stays silent to avoid double-inject). Absent ⇒ true. */
  personaMarkerActive?: boolean;
  /** Recent message texts, for keyword-WI matching at build time. */
  recentMessages: string[];
  currentInput?: string | undefined;
  lastMessage?: string | undefined;
  lastUserMessage?: string | undefined;
  lastCharMessage?: string | undefined;
  /** The rpg data-fed macro values (`{{rpgSceneState}}`/`{{rpgCast}}`/`{{rpgQuests}}`/`{{rpgDelta}}`/…), keyed by
   *  the RpgGatherMacros field names — a game turn's GATHER stages this from the tracker view. Absent (non-game /
   *  gather null) ⇒ every rpg macro resolves empty (byte-identical non-game turn). */
  rpgMacros?: Readonly<Record<string, string>> | undefined;
  /** Time since the last chat activity as human text (the `{{idle_duration}}` marker) — computed at GATHER off
   *  the message timestamps, EXCLUDING the in-flight message. Absent (a fresh one-message chat / no prior
   *  activity) ⇒ the marker resolves empty (byte-identical to a chat with no idle history). */
  idleDuration?: string | undefined;
  // The data-only CEL activation the `{{expr::…}}` macro evaluates against (the `rpg`/etc. bindings tree). A game
  // turn's GATHER stages an `rpg` binding whose value is the tracker view as a CelValue tree, so
  // `{{expr::rpg.scene.location}}` reads state; a non-game chat stages nothing ⇒ an `{{expr::rpg.…}}` errors-to-""
  // (the CEL degrade). Scalars/lists/maps only — NO functions (the `CelBindings` data-only contract). Absent ⇒
  // `{{expr}}` sees an empty binding (any field reference then errors → "" + an expr-error diagnostic).
  celBindings?: Readonly<Record<string, unknown>> | undefined;
  /** IANA timezone for `{{time}}`/`{{date}}`. Absent ⇒ server-local. */
  timezone?: string | undefined;
  /** Fixed clock for `{{time}}`/`{{date}}`, epoch-ms UTC. Absent ⇒ live wall clock. */
  nowMs?: number | undefined;
  /** The chat's compaction summary (the `{{compact_summary}}` marker). Null/absent ⇒ nothing rendered. */
  compactSummary?: string | null;
  /** The seq the compaction marker covers THROUGH (`chats.compactedAtSeq`). When a `compactSummary` is present,
   *  canon rows with `seq <= compactedThroughSeq` are EXCLUDED from the shaped prompt history — the marker stands
   *  in for them (full-reset semantics). Api-agnostic: covered turns never re-enter the prompt on ANY source, so
   *  a stateless chat carrying a swapped-in marker also never re-sends summarized turns. Null/absent/0 ⇒ no exclusion. */
  compactedThroughSeq?: number | null | undefined;
  /** Retrieved chat-history memory (the `{{memory}}` marker), pre-formatted by the memory subsystem. */
  memory?: string | null;
  /** The recall EXPLANATION for {@link AssembleContext.memory} (#250) — staged by the same GATHER (and
   *  re-staged by the engine's per-speaker witnessed re-run) that produced the text, copied verbatim onto
   *  {@link AssembleTrace.memoryRecall} by the BUILD walk. The `wiTrace` precedent: a trace input rides the
   *  ctx beside the value it explains, so the two can never describe different recalls. Absent ⇒ recall never
   *  ran for this context (a preview / hand-built ctx) ⇒ the trace reports `memoryRecall: null`. */
  memoryTrace?: MemoryRecallSlice | undefined;
  /** Retrieved databank document context (the `{{databank}}` marker), pre-formatted + budget-fitted by the
   *  databank GATHER op (DB6). ABSENT (never `""`) ⇒ the slot resolves empty, byte-identical to a
   *  non-databank turn. */
  databank?: string | null;
  /** Per-chat ChoiceBlock variable values (the `getvar` map) — threaded BY REFERENCE so a within-turn
   *  `setvar` mutates it in place. */
  variableValues?: Record<string, string> | undefined;
  /** The ORDERED log of variable mutations the macro engine records this turn — after the turn it IS the
   *  produced variant's `variable_delta`. Absent ⇒ mutations applied but not recorded (previews/tests). */
  opLog?: VarOp[] | undefined;
  /** One-turn ephemeral guidance for the `{{guided_instruction}}` marker. NEVER persisted; ALWAYS dynamic. */
  guidedInstruction?: string | null;
  /** Set true when a `system`-placement guided steer FELL BACK to a depth-0 injection because the active
   *  preset lacks/disables the `{{guided_instruction}}` marker (§10 addendum / F8). The steer still lands
   *  (via the injection list), but the engine reads this to emit a LOUD `guided_placed_as_injection`
   *  warning (D41). Absent/false ⇒ the steer landed via its intended placement. */
  guidedPlacedAsInjection?: boolean;
  /** Per-speaker group nudge fence — set FRESH per speaker (never accumulates), never persisted/rendered. */
  groupNudge?: string | null;
  /** The turn's generation type (the ST `injection_trigger` gate). Absent ⇒ `normal`. */
  generationType?: GenerationType;
  /** Pre-rendered ALWAYS-scope WI for the `world_info_before`/`world_info_after` anchor markers. */
  worldInfoBefore?: string;
  worldInfoAfter?: string;
  /** Pre-rendered KEYWORD-fired WI for the same two anchors. It rides the per-turn half at the anchor's place
   *  in the prompt order. Absent ⇒ nothing fired at that anchor. */
  worldInfoBeforeDynamic?: string;
  worldInfoAfterDynamic?: string;
  /** All positional injections for this turn (chat_injections ∪ WI converted at build time). */
  chatInjections?: ChatInjection[];
  /** The effective HOST-TIER regex set — the library rows resolved from the global/preset/character/chat scope
   *  junctions under the frozen `runAsUserId` (D19, never the caller). Absent ⇒ no host-tier regex. */
  hostTierRegexScripts?: readonly RegexScriptRow[] | undefined;
  /** WI-conversion trace, copied into `AssembleTrace` for the section-preview panel. `activated` is the
   *  budget-survived, actually-fired WI entries by identity (id + keyword list) — NOT `matchedKeys` (keyword
   *  strings, not entry identity). The engine's live-turn `worldInfoActivated` bus emit derives its id list
   *  from this (`pipeline.ts`); the host preview panel lists id + keys. */
  wiTrace?: {
    /** How many WORLD-INFO entries survived the budget pass — `activated.length`, never the size of the
     *  delivered injection list (that list carries five other candidate families). */
    included: number;
    dropped: { id: string; reason: "budget" }[];
    matchedKeys: { key: string; matchedLatestUserMessage: boolean }[];
    activated: { id: WorldEntryId; keys: string[] }[];
  };
}

/** One section's render preview (the COMPOSER/editor surface) — scoped to a single section. */
export interface SectionPreview {
  rendered: string;
  half: "static" | "dynamic";
  trace: AssembleTrace;
}
