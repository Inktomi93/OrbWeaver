// @orb/contracts/chat/assemble — the ASSEMBLE family: slim assembly projections + the per-turn
// `AssembleContext`, the BUILD/SHAPE traces, the context-fit preview, and the positional-injection wire.
// Types only — the producing engine (`assemblePrompt`/`buildAssembleContext`) is `domain/chat`. Slim
// projections (`AssembleCharacter`/`AssemblePersona`/`AssembleWorldEntry`) are re-homed HERE (not imported
// from `contracts/character`/`persona`) so `chat` avoids a `chat → character`/`persona` DAG edge.

import type { CharacterId, ChatInjectionId, MessageId, MessageVariantId, UserId, WorldEntryId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { InjectionPlacement } from "@orb/kit/injection";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { PersonaDescriptionPlacement } from "@orb/kit/persona";
import type { EntryPosition } from "@orb/kit/world-info";
import { z } from "zod";
import type { GenerationType, PromptConfig, UserIntent } from "#preset";
import type { ProseOverrides } from "#prose-slot";
import type { RegexScriptRow } from "#regex";
import type { WorldInfoScope } from "#world-info";
import type { MacroFreezeRecord, UserMacroDraws } from "./messages.ts";
import type { RoomOverrides } from "./metadata.ts";
import type { MessageKind, SpeakerRef } from "./participants.ts";
import { messageRoleSchema } from "./participants.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ASSEMBLE FAMILY — slim assembly projections, NOT re-exports of the full card/persona/entry shapes.
// Types only — the producing engine (`assemblePrompt`/`buildAssembleContext`) is `domain/chat`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The card's Character's-Note-\@-Depth projected onto the assemble cast — spliced into history at a
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
  id: brandedId<ChatInjectionId>().optional(),
  position: z.enum(CHAT_INJECTION_POSITIONS),
  depth: z.number().int(),
  role: messageRoleSchema,
  content: z.string(),
  order: z.number().int().optional(),
});
export type ChatInjectionInput = z.infer<typeof chatInjectionInputSchema>;

/** Debug metadata about what assembly did — NOT the prompt text. Answers "why did/didn't this fire?"
 *  without dumping RP content (the host/admin-only trace surface). */
export interface AssembleTrace {
  staticSections: string[];
  dynamicSections: string[];
  worldInfoIncluded: number;
  worldInfoDropped: { id: string; reason: "budget" }[];
  /** The WI entries that actually FIRED into this turn's prompt — the budget-survived pool by entry IDENTITY
   *  (not `matchedKeys`, which is keyword strings). `keys` is the entry's keyword list ([] for an always-scope
   *  entry); the host inspector lists these so a human can see WHICH lore the model saw. Empty ⇒ no WI fired. */
  worldInfoActivated: { id: string; keys: string[] }[];
  matchedKeys: { key: string; matchedLatestUserMessage: boolean }[];
  compactSummaryIncluded: boolean;
  memoryIncluded: boolean;
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
export const SHAPE_BREAKPOINT_DECISIONS = ["placed", "no-stable-prefix", "in-prefix-injection-or-squash", "second-volatile-tail"] as const;
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
  /** Offset-from-end of the pinned cache breakpoint; ABSENT when none was placed (the `placed` decision
   *  carries it, every other decision omits it). */
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
 *  degenerate-case doctrine: solo is the trivial cast, never an `if(isGroup)` branch). */
export interface AssembleContext {
  /** The active/primary character for this turn. */
  character: AssembleCharacter;
  /** The resolved generation config the BUILD walk renders against (the reorderable section model). The
   *  `chat → preset` edge (DAG §1): assembly always builds against a `PromptConfig`. */
  promptConfig: PromptConfig;
  /** All character members (primary first). A roster-of-one solo chat is exactly `[character]`. */
  cast?: AssembleCharacter[];
  /** Per-cast-member character id, index-aligned with `cast`. Null for a non-character slot — an AGENT seat
   *  (D60; its cast card is its resolved soul, it has no characterId) or a hand-built/legacy member. */
  castCharacterIds?: (CharacterId | null)[];
  /** Per-cast-member SPEAKER identity, index-aligned with `cast` (D60) — a `character` or an `agent` (whose
   *  card is its resolved soul). The per-speaker card selection (`shape(ctx, speaker)`) keys on THIS to pick
   *  the active member + the co-speakers; a character-only room's refs are all `{kind:'character'}`. Absent ⇒
   *  a hand-built/legacy ctx (the per-speaker shape falls back to the primary — byte-identical). */
  castMembers?: SpeakerRef[];
  /** The non-muted CHARACTER subset of `cast` — drives `{{groupNotMuted}}`. Character-only by owner ruling:
   *  the `{{group}}`-family macros never list agent seats (an agent voices via the cast, but is not a name in
   *  these lists). Absent ⇒ falls back to the full CHARACTER cast (the macro layer re-derives it). */
  castNotMuted?: AssembleCharacter[];
  /** Who is generating: `single` (per-speaker, `{{char}}` = that character) vs `cast` (narrator, `{{char}}`
   *  = the whole cast). Solo is always `single`. */
  speaker?: { kind: "single"; character: AssembleCharacter } | { kind: "cast"; members: AssembleCharacter[]; active: AssembleCharacter };
  /** Other present cast whose cards merge into THIS turn's character section (`cardScope: "merged"`). */
  coSpeakers?: AssembleCharacter[] | undefined;
  /** The identity of the per-speaker turn's active character — drives the `cardScope: "scoped"` egocentric
   *  history fold. Absent (merged / narrator / solo) ⇒ no fold. */
  activeSpeakerCharacterId?: CharacterId | null | undefined;
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
  /** `{{user}}` in USER-authored sections — the speaking participant's active persona. */
  activePersona?: AssemblePersona | null;
  /** WHOSE persona {@link AssembleContext.activePersona} is — the live human driving this turn. It exists for
   *  ONE rule, in SHAPE: a canon user row carrying NO persona stamp may borrow this turn's `{{user}}` name
   *  only when the row is that same human's OWN row; every other null-stamped row floors to the
   *  unresolvable-persona name instead of wearing a stranger's identity on the wire. This is the server twin
   *  of the client's fail-closed render rule (`client/features/chat/lib/attribution.ts` `resolveUserAttribution`
   *  — the `authorUserId === viewerUserId` gate). Null/absent (a drain/auto turn, a preview, any hand-built
   *  ctx) ⇒ NO row borrows it, which is the fail-closed side. */
  triggerUserId?: UserId | null | undefined;
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
  /** All positional injections for this turn (chat_injections ∪ WI converted at build time). */
  chatInjections?: ChatInjection[];
  /** The effective HOST-TIER regex set — the library rows resolved from the global/preset/cast/chat scope
   *  junctions under the frozen `runAsUserId` (D19, never the caller). Absent ⇒ no host-tier regex. */
  hostTierRegexScripts?: readonly RegexScriptRow[] | undefined;
  /** WI-conversion trace, copied into `AssembleTrace` for the section-preview panel. `activated` is the
   *  budget-survived, actually-fired WI entries by identity (id + keyword list) — NOT `matchedKeys` (keyword
   *  strings, not entry identity). The engine's live-turn `worldInfoActivated` bus emit derives its id list
   *  from this (`pipeline.ts`); the host preview panel lists id + keys. */
  wiTrace?: {
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
