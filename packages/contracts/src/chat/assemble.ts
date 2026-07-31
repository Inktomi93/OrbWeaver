// @orb/contracts/chat/assemble — the ASSEMBLE family: slim assembly projections + the per-turn
// `AssembleContext`, the BUILD/SHAPE traces, the context-fit preview, and the positional-injection wire.
// Types only — the producing engine (`assemblePrompt`/`buildAssembleContext`) is `domain/chat`. Slim
// projections (`AssembleCharacter`/`AssemblePersona`/`AssembleWorldEntry`) are re-homed HERE (not imported
// from `contracts/character`/`persona`) so `chat` avoids a `chat → character`/`persona` DAG edge.

import type { CharacterId, ChatInjectionId, MessageId, WorldEntryId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import type { InjectionPlacement } from "@orb/kit/injection";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import type { PersonaDescriptionPlacement } from "@orb/kit/persona";
import type { EntryPosition } from "@orb/kit/world-info";
import { z } from "zod";
import type { GenerationType, PromptConfig } from "#preset";
import type { RegexScript } from "#regex";
import type { WorldInfoScope } from "#world-info";
import type { RoomOverrides } from "./metadata";
import type { SpeakerRef } from "./participants";
import { messageRoleSchema } from "./participants";

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
}

/** The injection PRODUCER axis (see {@link ChatInjection.origin}) — declared ONCE as a tuple and DERIVED
 *  (§5.5, no inline union re-spell). Not a wire-input axis: `chatInjectionInputSchema` deliberately omits it
 *  (a client never authors provenance — the `user` origin is stamped server-side when the row is mapped). */
export const CHAT_INJECTION_ORIGINS = ["user", "world-info", "persona", "authors-note", "guided", "game-state"] as const;
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

/** ONE source's slice of the next turn's estimated context (`AssemblyBudgetPreview.sources`). `tokens` is the
 *  LOCAL estimate (`@orb/kit/tokens` QuadChars — the same estimator the history fit runs), never billing truth. */
export interface AssemblyBudgetSlice {
  source: AssemblySource;
  /** The contributors that make up this slice, deduped in prompt order ("character description · personality"),
   *  or the history row's "N turns · M dropped". Empty string ⇒ nothing to add beyond the source name. */
  detail: string;
  tokens: number;
  /** The assembled text attributed to this source — the drill-in body, verbatim as the model receives it.
   *  EMPTY for `history` BY CONSTRUCTION: the wire history is canon the transcript already renders, so the
   *  preview accounts for its COST without re-serving it (the same content-free posture as {@link ShapeTrace}). */
  text: string;
}

/** The next turn's context accounting (`previewAssembly`) — the stacked budget bar + its per-source breakdown.
 *  `ceilingTokens` = the SAME `min(capability window, preset maxContextTokens)` the engine's history fit uses,
 *  `0` ⇒ unbounded (no capability window and no soft cap — the bar then renders proportions with no ratio).
 *  `totalTokens` = Σ `sources[].tokens`, so the segments always partition the bar exactly. */
export interface AssemblyBudgetPreview {
  ceilingTokens: number;
  totalTokens: number;
  /** Prompt-ordered, EMPTY sources omitted — a plain (non-game) chat carries no `game-state` row. */
  sources: readonly AssemblyBudgetSlice[];
}

/** Why SHAPE did/didn't place the §8 cache breakpoint — the abort taxonomy, content-free. Declared ONCE as
 *  a tuple and DERIVED (no inline-union re-spell; §5.5). The server builder (`chat/assembly/trace.ts`) labels
 *  the outcome; the host inspector renders it. */
export const SHAPE_BREAKPOINT_DECISIONS = ["placed", "no-stable-prefix", "in-prefix-injection-or-squash", "second-volatile-tail"] as const;
export type ShapeBreakpointDecision = (typeof SHAPE_BREAKPOINT_DECISIONS)[number];

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
  reserveOutputTokens: number;
  droppedCount: number;
  /** The chat's LINEAR-tier compaction summary (`chats.compactSummary`) when it covers the span ABOVE the fit
   *  boundary — the divider then reports that older messages are compacted into memory + offers a peek at this
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
  /** Host-level per-room overrides (`room > card > preset`). Absent ⇒ no room tier. */
  roomOverrides?: RoomOverrides;
  /** Resolved source of the author's-note depth injection ("room override" / "from <Name>"). */
  authorsNoteSource?: string;
  /** `{{user}}` in CARD-derived sections — the chat-open ("anchor") persona. */
  pinnedPersona?: AssemblePersona | null;
  /** `{{user}}` in USER-authored sections — the speaking participant's active persona. */
  activePersona?: AssemblePersona | null;
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
  /** The effective HOST-TIER regex set — host-global ∪ chat-preset ∪ cast, resolved under the frozen
   *  `runAsUserId` (D19, never the caller). Absent ⇒ no host-tier regex this turn. */
  hostTierRegexScripts?: readonly RegexScript[] | undefined;
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
