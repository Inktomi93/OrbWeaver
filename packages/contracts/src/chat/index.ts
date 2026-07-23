// @orb/contracts/chat — the chat-message role schema, the D26 message/variant wire contract, the
// ASSEMBLE family, the chat stream-delta + bus union, and the room/group/opening shapes.
//
// LAWS honored here:
//   • Turn identity (D19): a wire shape that carries turn attribution uses `triggeredBy`/`runAsUserId`,
//     NEVER `callerUserId`. No bus event here carries a caller id.
//   • No `chats.ownerId` (D18): chats are membership-scoped; no wire shape stamps a chat owner.
//   • Bus-payload allowlist: credentials/secrets/baseUrls are TYPE-LEVEL UNREPRESENTABLE in `ChatBusEvent`
//     — every member is a closed object literal of branded ids, enums, scalars, and `MessageView`.
//   • D26: `messages` is a pure SLOT (no content/economics); all generation content lives on
//     `message_variants`. `MessageView` is the slot joined with its selected variant.

import type { ContentSpan } from "@orb/kit/content";
import type {
  AssetId,
  CharacterId,
  ChatId,
  ChatInjectionId,
  ChatInviteId,
  ChatParticipantId,
  Handle,
  MessageId,
  MessageVariantId,
  PersonaId,
  UserId,
  WorldEntryId,
} from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { InjectionPlacement } from "@orb/kit/injection";
import { injectionDirectiveSchema } from "@orb/kit/injection";
import type { RowCharacterName, RowPersonaName, VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import type { PersonaDescriptionPlacement } from "@orb/kit/persona";
import { z } from "zod";
import type { ChatApi, CredentialSource, OpenRouterProviderRouting } from "#connection";
import type { ChatDocumentVisibility } from "#databank";
import type { ParticipantRole } from "#identity";
import { PARTICIPANT_ROLES } from "#identity";
import type { GenerationType, PromptConfig, UserIntent } from "#preset";
import type { RegexScript } from "#regex";
import type { ThemeBackground, ThemeOverride } from "#theme";
import type { WiBusEvent, WorldInfoScope } from "#world-info";

// `human`/`character` are the v1 kinds. `agent` is a first-class userId-backed AND AI-driven principal
// (D60). `observer` is the reserved seam (Narrative Director — watches + proposes, never acts, unseatable).
// PD-17: the `agent` seat is FILLED by `chat.seatAgent` (host-gated; AP3-1 verb, wired to the tRPC chat
// router at P6) + requested owner≠host via `invites.requestAgentSeat`. `observer` stays reserved (unfillable).
export const PARTICIPANT_KINDS = ["human", "character"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];
export const participantKindSchema = z.enum(PARTICIPANT_KINDS);

// `kind` carries TWO facts: the identity table (userId vs characterId) AND who DRIVES the seat.
// `AI_DRIVEN_KINDS` splits out the DRIVE axis (the seats arbitration schedules/voices) — an agent is
// AI-driven AND userId-backed. `USER_BACKED_KINDS` is the human/agent shared column shape (both FK `users`).
export const AI_DRIVEN_KINDS = ["character"] as const satisfies readonly ParticipantKind[];
export const USER_BACKED_KINDS = ["human"] as const satisfies readonly ParticipantKind[];
export const isAiDriven = (k: ParticipantKind): boolean => (AI_DRIVEN_KINDS as readonly ParticipantKind[]).includes(k);
export const isUserBacked = (k: ParticipantKind): boolean => (USER_BACKED_KINDS as readonly ParticipantKind[]).includes(k);

/** The identity of ONE AI-driven speaker (D60). A `character` FKs `characters.id` */
export interface SpeakerRef {
  readonly kind: "character";
  readonly characterId: CharacterId;
}

/** The stable string key for a {@link SpeakerRef}. */
export function speakerKey(ref: SpeakerRef): string {
  return `c:${ref.characterId}`;
}

// The tuple is `@orb/kit/message-role`; the WIRE schema lives HERE (§5 tuple-in-kit rule). Every role
// field across this node goes through this one axis — no inline re-spell.
export const messageRoleSchema = z.enum(MESSAGE_ROLES);

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
  position: "before" | "after";
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
}

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
  /** IANA timezone for `{{time}}`/`{{date}}`. Absent ⇒ server-local. */
  timezone?: string | undefined;
  /** Fixed clock for `{{time}}`/`{{date}}`, epoch-ms UTC. Absent ⇒ live wall clock. */
  nowMs?: number | undefined;
  /** The chat's compaction summary (the `{{compact_summary}}` marker). Null/absent ⇒ nothing rendered. */
  compactSummary?: string | null;
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
  /** WI-conversion trace, copied into `AssembleTrace` for the section-preview panel. `entryIds` is the
   *  budget-survived, actually-fired WI entries — NOT `matchedKeys` (keyword strings, not entry identity). */
  wiTrace?: {
    included: number;
    dropped: { id: string; reason: "budget" }[];
    matchedKeys: { key: string; matchedLatestUserMessage: boolean }[];
    entryIds: WorldEntryId[];
  };
}

/** One section's render preview (the COMPOSER/editor surface) — scoped to a single section. */
export interface SectionPreview {
  rendered: string;
  half: "static" | "dynamic";
  trace: AssembleTrace;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MESSAGE / VARIANT WIRE CONTRACT (D26) — `messages` is a pure SLOT; ALL content/economics live on
// `message_variants`. `MessageView` is the slot joined with its SELECTED variant.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

const SEQ_MIN = 0;

/** The `messages` SLOT (D26): identity + attribution + selection ONLY — NO content, NO economics. A swipe
 *  APPENDs a `message_variants` row and `selectVariant` flips `selectedVariantId` (a pointer move, never a
 *  content copy). Attribution (`authorUserId`/`characterId`/`personaId`) is slot-level — a swipe never
 *  changes the voiced speaker. The schema is a plain `z.object` (strips unknown keys), so an attempt to
 *  carry a `content` field on the slot is dropped at the boundary — the D26 invariant made unrepresentable. */
export const messageSlotSchema = z.object({
  id: typeIdSchema(ID_PREFIX.message),
  chatId: typeIdSchema(ID_PREFIX.chat),
  seq: z.number().int().min(SEQ_MIN),
  role: messageRoleSchema,
  /** The human who SENT a user message (server-stamped). Null on assistant/system rows. */
  authorUserId: brandedId<UserId>().nullable(),
  /** The AI identity that VOICED an assistant message (keyed on `characters.id`). Null on user/system. */
  characterId: typeIdSchema(ID_PREFIX.character).nullable(),
  /** Which persona authored a user message. Null on assistant/system / no-persona chats. */
  personaId: typeIdSchema(ID_PREFIX.persona).nullable(),
  selectedVariantId: typeIdSchema(ID_PREFIX.messageVariant),
  /** When true, the slot is held out of the assembled prompt (a hidden message). */
  excludedFromPrompt: z.boolean(),
  createdAt: z.number().int(),
  editedAt: z.number().int().nullable(),
});
export type MessageSlot = z.infer<typeof messageSlotSchema>;

/** A `message_variants` row (D26) — the full generation record. Holds ALL content + economics +
 *  `promptSnapshot` (per-swipe). NO `characterId`/`authorUserId` — attribution is the SLOT's. A read view
 *  (server-produced, client-read), so it is an interface, not an inbound zod schema. */
export interface MessageVariant {
  id: MessageVariantId;
  messageId: MessageId;
  /** 0-based position among this slot's variants (swipes). */
  idx: number;
  content: string;
  reasoning: string | null;
  model: string | null;
  provider: string | null;
  reasoningEffort: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  costUsd: number | null;
  contextWindow: number | null;
  /** The §8 history-budget fit-pass boundary: the id of the earliest message actually included in the
   *  assembled history for this generation. Null = nothing was dropped / the fit-pass never ran. Powers
   *  a client "last-in-context boundary" divider. */
  contextBoundaryMessageId: MessageId | null;
  maxOutputTokens: number | null;
  ttftMs: number | null;
  finishReason: string | null;
  stopReason: string | null;
  terminalReason: string | null;
  /** The upstream OpenRouter generation handle (`gen-…`) this variant billed under — the key
   *  `connection.orGenerationCost` settles the per-message cost with (PD-137). Null on a non-OR turn. */
  generationId: string | null;
  /** The recorded generation params (D26 `params (UserIntent)`). */
  params: UserIntent | null;
  /** The per-variant assembled-prompt snapshot (D26 — now works per swipe). */
  promptSnapshot: AssembledPrompt | null;
  createdAt: number;
}

/** ONE model-emitted tool exchange, persisted on `message_variants.toolCalls` (D48; tool-use-design/03 §3).
 *  The client's ONLY tool read surface (chips render from this — never body-parse). Schema-first so the DB
 *  read seam parses with `toolCallRecordSchema` (never a cast — the `parseProviderMetadata` pattern). `result`
 *  is ALWAYS a JSON document when non-null (execute's one stringify site) so chips `JSON.parse` unconditionally;
 *  `result: null` ⇔ recorded-but-unexecuted (recurse-limit hit); `isError` is authoritative for error styling.
 *  FLAG[PD-54]: this DTO + the `message_variants.toolCalls` retype are the schema-leaf slice of T1 — landed so
 *  the born-compliant column is typed while the baseline window is open. The rest of T1 (the `HISTORY_ROLES`
 *  `tool` role, tool-call/tool-result `ChatContentPart` members, `tools`/`toolChoice`/`responseFormat` request
 *  fields, the `CHAT_WARNING_CODES` tool codes) + the domain-owned recurse loop remain (registry: PD-54 ready). */
/** ONE recorded runtime variable mutation (D46) — the read-parse boundary for `message_variants.variable_delta`.
 *  A discriminated union on `op` MIRRORING the kit {@link VarOp} (`set`/`add` carry a string `value`; `inc`/`dec`/
 *  `delete` don't). The db column is `$type<readonly VarOp[]>`; every read parses through {@link variableDeltaSchema}
 *  (the `parseChatMetadata` `.safeParse` pattern — never a cast). `satisfies z.ZodType<VarOp>` keeps this schema
 *  and the kit union from drifting: change the kit `VarOp` and this stops compiling. */
export const varOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), key: z.string(), value: z.string() }),
  z.object({ op: z.literal("add"), key: z.string(), value: z.string() }),
  z.object({ op: z.literal("inc"), key: z.string() }),
  z.object({ op: z.literal("dec"), key: z.string() }),
  z.object({ op: z.literal("delete"), key: z.string() }),
]) satisfies z.ZodType<VarOp>;

/** The ordered per-variant delta (`message_variants.variable_delta`). Parsed at the read seam; folded along the
 *  selected-variant chain (`foldVarOps`) into `chats.runtime_variables` (D46 runtime plane). */
export const variableDeltaSchema = z.array(varOpSchema);

/** One standalone (out-of-turn) delta batch (`chats.standalone_variable_deltas`, automation-design/03 §1.1) —
 *  a seq-stamped `applyVariableOps` write made with no turn in flight. Parsed at the read seam; folded into
 *  `chats.runtime_variables` interleaved with the message-variant deltas by `seq`. */
export const standaloneVariableDeltaSchema = z.object({ seq: z.number(), delta: variableDeltaSchema });
export const standaloneVariableDeltasSchema = z.array(standaloneVariableDeltaSchema);
export type StandaloneVariableDelta = z.infer<typeof standaloneVariableDeltaSchema>;

export const toolCallRecordSchema = z.object({
  // @orb-gate-ignore no-raw-id PROVIDER-emitted opaque tool-call handle (OpenAI `call_…`/Anthropic id) — never an orbweaver-minted brand; provenance-faithful, joins a tool-call to its result on the wire (tool-use-design/03 §3 types it `string`).
  toolCallId: z.string(),
  name: z.string(),
  /** RAW model-emitted JSON string (provenance-faithful; parsed once, at execute). */
  arguments: z.string(),
  /** JSON document serialized by execute; `null` = not executed (recurse-limit — tool-use-design/03 §2.2). */
  result: z.string().nullable(),
  isError: z.boolean(),
  /** `null` when unexecuted; else the execute duration (injected clock). */
  durationMs: z.number().nullable(),
});
export type ToolCallRecord = z.infer<typeof toolCallRecordSchema>;

/** The client read-model: the SLOT joined with its SELECTED variant (D26). The slot owns attribution + the
 *  `selectedVariantId` pointer; the joined variant supplies the displayed content + the per-turn economics
 *  readout. `variantCount`/`selectedVariantIdx` drive the "3 / 5" swipe counter. The cost/latency readout is
 *  exact for whichever swipe is shown (the economics live on each variant — D26 ends the swipe-overwrite). */
export interface MessageView {
  id: MessageId;
  chatId: ChatId;
  seq: number;
  role: MessageRole;
  authorUserId: UserId | null;
  characterId: CharacterId | null;
  personaId: PersonaId | null;
  excludedFromPrompt: boolean;
  createdAt: number;
  editedAt: number | null;
  selectedVariantId: MessageVariantId;
  /** Which swipe is shown (the selected variant's `idx`). */
  selectedVariantIdx: number;
  /** Total variants for this slot (1 = single generation). */
  variantCount: number;
  content: string;
  reasoning: string | null;
  model: string | null;
  provider: string | null;
  finishReason: string | null;
  stopReason: string | null;
  terminalReason: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  contextWindow: number | null;
  /** The §8 history-budget fit-pass boundary: the id of the earliest message actually included in the
   *  assembled history for this generation. Null = nothing was dropped / the fit-pass never ran. Powers
   *  a client "last-in-context boundary" divider. */
  contextBoundaryMessageId: MessageId | null;
  costUsd: number | null;
  ttftMs: number | null;
  /** Generation-window bounds (epoch-ms) for this swipe — the wall time the turn engine began/finished
   *  the model call. Both null on a non-generated row (user/system/draft-greeting). `gf − gs` (when both
   *  present and ordered) is the generation duration the `showGenerationTimer` chip reads (PD-130). */
  genStartedAt: number | null;
  genFinishedAt: number | null;
  /** The upstream OpenRouter generation handle (`gen-…`) this shown swipe billed under — the key a quiet
   *  per-message cost readout settles with via `connection.orGenerationCost` (PD-137). Null on a non-OR
   *  turn (agent-sdk / user/system row). */
  generationId: string | null;
  /** The selected variant's persisted tool exchanges (D48; tool-use-design/03 §3–4), in emission/execution
   *  order — the client's ONLY tool read surface (chips render from this; NEVER body-parse). Empty on every
   *  non-tool turn. Parsed with `toolCallRecordSchema` at the DB read seam (never cast); the wire shape is a
   *  plain array (`[]` = no calls), so a client maps it unconditionally through the `TOOL_RENDERERS` seam. */
  toolCalls: readonly ToolCallRecord[];
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CHAT MACRO NAME PRODUCER — a chat read's member-gated id→name maps, so a client can DERIVE per-row
// `{{char}}`/`{{user}}`/`{{persona}}` names via `resolveRowMacros`. Rows stay id-only — this is the
// PRODUCER, never a per-row denormalized name. Wire-serializable as ARRAYS (raw JSON, no superjson
// transformer here — a `Map` doesn't survive a JSON round-trip).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** One character name entry (§1) — the array form of a `characterNamesById` producer map. */
export interface CharacterNameEntry {
  readonly id: CharacterId;
  readonly name: string;
}

/** One persona name entry (§1) — the array form of a `personaNamesById` producer map. `description`
 *  backs the row `{{persona}}` macro (distinct from `{{user}}`, which resolves to `name`). */
export interface PersonaNameEntry {
  readonly id: PersonaId;
  readonly name: string;
  readonly description: string;
}

/** Rebuild the `characterNamesById` lookup `resolveRowMacros` takes, from the wire array. Pure;
 *  last-write-wins on a duplicate id. */
export function buildCharacterNameMap(entries: readonly CharacterNameEntry[]): ReadonlyMap<CharacterId, RowCharacterName> {
  return new Map(entries.map((e) => [e.id, { name: e.name }]));
}

/** Rebuild the `personaNamesById` lookup `resolveRowMacros` takes, from the wire array. */
export function buildPersonaNameMap(entries: readonly PersonaNameEntry[]): ReadonlyMap<PersonaId, RowPersonaName> {
  return new Map(entries.map((e) => [e.id, { name: e.name, description: e.description }]));
}

/** The producer a chat read returns (§1) — `personaNamesById`/`characterNamesById` scoped to ONE chat,
 *  covering every id the chat references (participants' personas/characters AND any `personaId`/
 *  `characterId` a stored message carries, incl. since-switched personas). Member-gated: any chat member
 *  may read this (see the header note — names only, not a permission-spine change). */
export interface ChatMacroNameProducer {
  readonly characterNames: readonly CharacterNameEntry[];
  readonly personaNames: readonly PersonaNameEntry[];
}

/** One persona AVATAR entry — the array form of a `personaAvatarsById` producer map, SAME coverage
 *  algorithm as {@link ChatMacroNameProducer}'s `personaNames` (every participant's active persona UNION
 *  every stored message row's `personaId` stamp) but a DELIBERATELY SEPARATE type: the macro-name
 *  producer (`RowPersonaName`, `@orb/kit/macro`) is "names only, never the full entity" (chat-macro-
 *  resolution §1) — avatar chrome is a display concern the macro engine must never carry. Fed to
 *  `resolveRowAttribution`'s USER-row path (`features/chat/lib/attribution.ts`), never to
 *  `resolveRowMacros`. */
export interface PersonaAvatarEntry {
  readonly id: PersonaId;
  readonly avatarHash: string | null;
}

/** Rebuild the `personaAvatarsById` lookup `resolveRowAttribution` takes, from the wire array. Pure;
 *  last-write-wins on a duplicate id (mirrors {@link buildPersonaNameMap}). */
export function buildPersonaAvatarMap(entries: readonly PersonaAvatarEntry[]): ReadonlyMap<PersonaId, string | null> {
  return new Map(entries.map((e) => [e.id, e.avatarHash]));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CHAT STREAM DELTA + THE CHAT BUS UNION
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** A stream delta wrapped inside a `ChatBusEvent` of `type: "delta"`. */
export type ChatDeltaEvent = { chatId: ChatId; kind: "text"; text: string } | { chatId: ChatId; kind: "reasoning"; text: string };

/** One part of a history turn's content on the PROVIDER-SEND path (D45). A turn is ALWAYS a content-part
 *  array; a text-only turn is a one-element `[{ type:"text" }]` (no `if(hasImage)` branch — the no-special-case
 *  discipline). `image.url` is the resolved, model-fetchable URL/data-URI the chat domain produced at the
 *  engine REQUEST seam (asset→CAS URL or a gated external URL); a non-vision model never receives image parts
 *  (the engine drops them, gated by `ModelCapability.input.vision`, + emits a `warning` bus event). This is
 *  the ONE home (D45 "the cross-boundary message DTOs in `@orb/contracts/chat` carry the same"); the infra
 *  `ChatHistoryMessage` imports it. Distinct from the D44 RENDER `MessageContentBlock` (display ⇆ client). */
export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly url: string }
  /* The D48 tool exchange (tool-use-design/02 §1): parts are the WIRE form only — persisted form is
   * `ToolCallRecord[]` on the variant (never markdown in a body, never a slot row); assembly MATERIALIZES
   * a recorded exchange into `assistant(tool-call)` + `tool(tool-result)` messages at the engine REQUEST
   * seam, so the string-shaped assemble/SHAPE transforms stay parts-blind (the D51 law, both directions). */
  | {
      readonly type: "tool-call"; // assistant emits — one per model-requested call
      readonly toolCallId: string;
      readonly name: string;
      /** RAW model-emitted JSON string (parsed once, at execute). */
      readonly arguments: string;
    }
  | {
      readonly type: "tool-result"; // the wire `tool` role carries — one per executed call
      /** Joins back to the originating tool-call. */
      readonly toolCallId: string;
      /** The record's `result` JSON document. */
      readonly content: string;
      readonly isError?: boolean | undefined;
    };

/** Why the engine dropped content from a turn (the domain-originated `warning` bus event — distinct from the
 *  infra runner's `ResolvedWarning`/`WARNING_CODES`, which report resolve/wire drops). One home; the union is
 *  derived from this tuple (no inline re-spell). */
export const CHAT_WARNING_CODES = [
  // Image parts were stripped because the resolved model's `input.vision` isn't true (D45).
  "image_dropped",
  // Tools were attached but `capability.tools` is absent → dropped; the turn proceeds tool-less
  // (D48; the domain-side gate per D51's rule — the emit site is the engine's attach gate).
  "tools_unsupported",
  // The post-turn memory build (§3a fire-and-forget) threw — group/scoped digests did NOT build this turn
  // (a summarizer outage, a store failure, a mint failure). Emitted from the engine's memory-trigger catch so
  // the silent-failure black hole (stickler F1/F1d) is observable; the turn's reply is unaffected.
  "memory_build_failed",
  // A structured-output `responseFormat` was requested but `capability.output.structured` isn't true → dropped;
  // the turn proceeds free-text (D79 interactive-axis degrade, 04 §7; the emit site is the engine's structured
  // request-builder gate, mirror of tools_unsupported).
  "structured_output_unsupported",
  // A registered `PromptTransform` (automation `transform_draft` / a plugin) threw or blew its 250 ms deadline
  // → the draft passed through UNCHANGED (automation-design/04 §6; D53 — a broken transform never eats a turn).
  // Emitted from the registry's apply pass so a host sees a misbehaving rule/plugin without losing the reply.
  "prompt_transform_skipped",
  // An image generation dropped its edit/avatar-reference input because the resolved image model lacks
  // `input.imageEdit` (imagery-design/03 §2 — the domain B3 gate drops-with-warning, or the runner belt strips
  // a stale-capability edit). Emitted from `chat.generateImage`, mapping `GeneratedPicture.warnings` onto the
  // one chat `warning` surface so the user sees "generated without the avatar reference (model can't edit)".
  "image_edit_dropped",
  // The GRANULAR ComfyUI lever drops (comfyui-control §4.6/§4.12, C6) — one curated role's family couldn't honor
  // ONE provided edit lever, so that lever was ignored and the rest of the image still generated (a per-lever
  // visible degrade, distinct from the wholesale `image_edit_dropped`). Each rides its OWN chat `warning` event
  // (never collapsed) so a user who picked a pose learns THE POSE dropped, specifically — the mask on a
  // no-inpaint family, the reference image on a no-identity arch, the pose control map on a no-ControlNet family.
  // Emitted from `chat.generateImage`, same imagery→chat mapping as `image_edit_dropped`.
  "image_inpaint_dropped",
  "image_identity_dropped",
  "image_pose_dropped",
] as const;
export type ChatWarningCode = (typeof CHAT_WARNING_CODES)[number];

/** The turn kinds a lifecycle bus event reports. One home (no inline re-spell across the three members). */
export const TURN_INTENTS = ["send", "swipe", "continue", "generate", "impersonate"] as const;
export type TurnIntent = (typeof TURN_INTENTS)[number];

/** Why a turn aborted. */
export const TURN_ABORT_REASONS = ["user", "error", "stale"] as const;
export type TurnAbortReason = (typeof TURN_ABORT_REASONS)[number];

/** The `DomainOperationError.code` a lock-loss / cancel / fault turn abort surfaces to an AWAITING caller —
 *  the wire-vocabulary home the client keys on off a tRPC error's `data.reason` (the seat-refusal precedent:
 *  reason codes live ONCE in contracts, and the server's `CHAT_OP_CODES` derives this literal). A turn that
 *  dies to a stale lock rejects the awaited verb with this code; the client suppresses its generic
 *  "couldn't send" toast for it so the honest bus notice (`turnAbortNotice`) is the single stale surface. */
export const TURN_ABORTED_OP_CODE = "aborted" as const;
export type TurnAbortedOpCode = typeof TURN_ABORTED_OP_CODE;

// ── Turn origin — who/what started a turn + its cascade depth (automation-design/03 §4) ──
// TURN-PATH STATE, never a bus-event field: the D19/D50 allowlist forbids attribution on the public bus, so
// this rides the committed reply SLOT (`messages.initiator`/`.automationDepth`) and is read back by the ONE
// narrow `getTurnOrigin` op — the automation cascade guard's depth source. Human turns are born
// `"human"`/depth 0 (the column defaults); a NON-HUMAN `requestTurn` (AC-B) stamps its initiator + the parent
// depth + 1. `"automation"` = an automation rule's `trigger_turn` arm; `"plugin"` = a Tier-2 plugin membrane
// host-fn's turn.trigger (both funded by + consent-gated on the responsible human, depth-capped). The cascade
// guard treats every non-`"human"` initiator identically (depth is the lever, not the label). A new initiator
// fails `tsc` at the `messages.initiator` CHECK derive until the enum learns it.
export const TURN_INITIATORS = ["human", "automation", "plugin"] as const;
export type TurnInitiator = (typeof TURN_INITIATORS)[number];

/** The hard cascade-depth cap (automation-design/03 §4) — nothing fires at `automationDepth >= cap`, opt-in or
 *  not, and a `requestTurn` may not stamp a reply DEEPER than it. ONE home for the magic bound: the automation
 *  dispatch gate reads it (the READ side) and chat's `requestTurn` self-refuses `> cap` (the WRITE-side belt for
 *  the plugin path, which has no dispatch gate above it). Homed in `contracts/chat` beside `TurnOrigin` because
 *  it is turn-origin-depth vocabulary shared by two domains that cannot import each other (chat ↮ automation). */
export const AUTOMATION_DEPTH_HARD_CAP = 3;

/** A turn's origin classification — the metadata automation rules gate on (the cascade guard's depth counter
 *  + the initiator). Read back through `getTurnOrigin`; stamped on the reply slot at commit. */
export interface TurnOrigin {
  readonly initiator: TurnInitiator;
  /** 0 for a human turn; parentDepth + 1 for an automation-triggered turn (hard cap 3 — 03 §4). */
  readonly automationDepth: number;
}

/** How `getTurnOrigin` addresses a turn — by the committed reply SLOT it produced (a `messageCommitted`/
 *  `turnCompleted` fact resolves depth through this). An object (not a bare id) so a future turn-id ref is
 *  additive. */
export interface TurnRef {
  readonly messageId: MessageId;
}

// ── The D50 PromptTransform seam (automation-design/04 §6) ──
// The ONE synchronous hook onto the turn pipeline: an ordered, bounded transform over a turn's draft text,
// applied at exactly TWO fixed points (never anywhere else). Automation's `transform_draft` arm and the
// plugin host are its only two REGISTRARS; chat owns the pipeline points + the deadline/skip discipline.
// D50's ruling: ST's mutable-prompt interceptor cluster is NEVER a bus effect — by the time a bus subscriber
// runs, the prompt has shipped; a synchronous transform is this ordered step instead.
export const PROMPT_TRANSFORM_POINTS = [
  // SEND, after the macro pass, before USER_INPUT regex (the author-side transform order — D51).
  "user_input",
  // End of BUILD, over the DYNAMIC half only — the static (cache-stable) half is untransformable (03 §1.2's
  // per-turn-cache-bill argument); a rule wanting static content uses `insert_world_info_entry` instead.
  "assembled_dynamic",
] as const;
export type PromptTransformPoint = (typeof PROMPT_TRANSFORM_POINTS)[number];

/** The read-only env a transform sees. `vars` is a snapshot of the chat's runtime fold cache — mutation goes
 *  through actions (`set_variable`), NEVER a transform (a transform only rewrites the draft it's handed). */
export interface PromptTransformEnv {
  readonly chatId: ChatId;
  readonly vars: Record<string, string>;
}

/** An ordered, bounded, synchronous-per-call transform over a turn's draft text. Registered at
 *  `entry/compose` into the pipeline's transform list; applied in ascending `order` (automation registers
 *  0–999, plugins 1000+ — host policy wraps guest). Each `apply` is deadline-bounded by the CALLER (250 ms);
 *  a timeout or throw SKIPS it (draft unchanged) + emits a `prompt_transform_skipped` warning (D53). */
export interface PromptTransform {
  readonly id: string;
  readonly point: PromptTransformPoint;
  readonly order: number;
  readonly apply: (draft: string, env: PromptTransformEnv) => Promise<string>;
}

/** The chat bus union — the room-public event stream (`streamMessages` fans these out; the durable log
 *  replays them). It EMBEDS `WiBusEvent` (`#world-info`) so the WI domain emits without importing chat.
 *
 *  BUS-PAYLOAD ALLOWLIST (Part III inv §11): every member is a closed object literal of branded ids, enum
 *  literals, plain scalars, and `MessageView` — there is NO `unknown`/`Record`/index field. Credentials /
 *  secrets / baseUrls are therefore TYPE-LEVEL UNREPRESENTABLE: a producer cannot place an `apiKey` into a
 *  bus event because no member declares a field to carry it. (The `.contract.test` pins this.) No member
 *  carries a caller id — turn attribution lives on the turn path (`triggeredBy`/`runAsUserId`), never the
 *  public bus (D19). */
export type ChatBusEvent =
  | { type: "delta"; chatId: ChatId; delta: ChatDeltaEvent }
  // ── Canon mutations (view = the no-refetch carrier; absent only if the row raced a delete) ──
  | { type: "messageCommitted"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "messageEdited"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  // A slot's `excludedFromPrompt` flag flipped (hidden from assembly / restored) — a pure slot-flag change,
  // no content edit; the fresh view carries the flag (PD-86: the dedicated carrier, not `messageEdited`).
  | { type: "messageHidden"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "variantSelected"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "messagesDeleted"; chatId: ChatId; messageIds: MessageId[] }
  | { type: "messagesReordered"; chatId: ChatId }
  | { type: "reasoningEdited"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "reasoningCleared"; chatId: ChatId; messageId: MessageId; view?: MessageView }
  | { type: "reasoningStreamDone"; chatId: ChatId }
  // ── Turn lifecycle (the extensibility seam) ─────────────────────────────────
  | {
      type: "turnStarted";
      chatId: ChatId;
      intent: TurnIntent;
      api: ChatApi;
      source: CredentialSource;
      model: string;
      /** The roster character speaking this turn (group "whose turn is it" automation; ST GROUP_MEMBER_DRAFTED).
       *  Null for a single-character chat or a non-character turn. */
      speakerCharacterId: CharacterId | null;
      /** For swipe/continue, the message this turn rerolls/extends (the ghost-slot id). Null otherwise. */
      targetMessageId: MessageId | null;
    }
  | { type: "turnCompleted"; chatId: ChatId; intent: TurnIntent; messageId: MessageId | null }
  // An aborted turn commits NO reply slot, so its cascade depth (automation-design/03 §4) cannot be read back
  // through `getTurnOrigin` (there is no message to read). It therefore rides HERE as a plain scalar so the
  // automation fact-resolver can gate the cascade: an aborted automation turn (depth ≥ 1) must NOT re-trigger
  // non-opted `turnAborted` rules — a "retry on failure" rule at depth 0 self-loops otherwise. This is turn-
  // path DEPTH, not attribution: no caller id, no secret (the allowlist bans those, not a counter). 0 = a
  // human-plane turn (the `TurnPrep.automationDepth` default).
  | { type: "turnAborted"; chatId: ChatId; intent: TurnIntent; reason: TurnAbortReason; automationDepth: number }
  // ── Turn warning (domain-originated; e.g. image parts dropped for a non-vision model, D45) ──
  | { type: "warning"; chatId: ChatId; code: ChatWarningCode }
  // ── World-info ACTIVATION (which entries FIRED during this turn's assembly — distinct from the
  //    attachment changes in WiBusEvent; ST WORLD_INFO_ACTIVATED — the "what lore fired" automation hook) ──
  | { type: "worldInfoActivated"; chatId: ChatId; entryIds: WorldEntryId[] }
  | { type: "personaSwitched"; chatId: ChatId; from: PersonaId | null; to: PersonaId | null }
  // ── World-info attachment changes (chat-surface only; embedded from #world-info) ──
  | WiBusEvent
  | { type: "chatCreated"; chatId: ChatId }
  | { type: "chatDeleted"; chatId: ChatId }
  // ── Chat session open (subscription-synthesized at participant stream-attach, like `historyTruncated`;
  //    per-viewer, NOT a canon mutation, never logged — the ST CHAT_CHANGED automation trigger: "on chat
  //    open, set POV / run setup") ──
  | { type: "chatOpened"; chatId: ChatId }
  // ── Resume control (subscription-synthesized; never emitted by domain code, never logged) ──
  | { type: "historyTruncated"; chatId: ChatId }
  // ── Catch-all for low-payload chat-row changes (star/archive/title/variables/injections/compact) ──
  | { type: "chatUpdated"; chatId: ChatId };

/** Valid bus discriminators, derived from the union. The `satisfies Record<ChatBusEvent["type"], true>`
 *  makes `tsc` error if a member is added without a matching entry — keeping the replay guard exhaustive
 *  (the durable log is untyped JSON; corrupt/legacy rows are filtered against this set before re-emit). */
export const CHAT_BUS_EVENT_TYPES = {
  delta: true,
  messageCommitted: true,
  messageEdited: true,
  messageHidden: true,
  variantSelected: true,
  messagesDeleted: true,
  messagesReordered: true,
  reasoningEdited: true,
  reasoningCleared: true,
  reasoningStreamDone: true,
  turnStarted: true,
  turnCompleted: true,
  turnAborted: true,
  warning: true,
  worldInfoActivated: true,
  personaSwitched: true,
  wiBookAttached: true,
  wiBookDetached: true,
  wiEntryAttached: true,
  wiEntryDetached: true,
  wiEntryScopeChanged: true,
  chatCreated: true,
  chatDeleted: true,
  chatOpened: true,
  historyTruncated: true,
  chatUpdated: true,
} satisfies Record<ChatBusEvent["type"], true>;

/** True when `t` is a known `ChatBusEvent` discriminator (see {@link CHAT_BUS_EVENT_TYPES}). */
export function isChatBusEventType(t: string): t is ChatBusEvent["type"] {
  return Object.hasOwn(CHAT_BUS_EVENT_TYPES, t);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// MISFILED-FROM-SETTINGS CHAT SHAPES (shared-dissolution §7 #4) — chatMetadata sub-blobs / start-chat
// unions consumed by chat verbs + assemble types + client chat forms, NOT the settings KV.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

// ── Room overrides (host-only; exactly four fields — the Part III §9 allowlist) ──
const OVERRIDE_FIELD_MAX = 100_000;
const overrideField = z.string().max(OVERRIDE_FIELD_MAX);

// ── The ROOM author's note — a first-class at-depth injection directive (task #22) ──────────────────────
// The room's single author's note rides the SAME shared `{depth, role?}` at-depth mechanism the card
// `depthPrompt` (`cardDepthPromptSchema`), world-info-at-depth, and the persona description use (D32),
// widened from a bare string so the host can set its depth + role. `depth`/`role` are OPTIONAL — the
// assembler defaults them ({@link AUTHORS_NOTE_DEFAULT_DEPTH} / {@link AUTHORS_NOTE_DEFAULT_ROLE}); `prompt`
// keeps the 100k override cap. MIGRATION: a `z.preprocess` coerces a LEGACY bare string (the pre-#22 stored
// shape) → `{prompt}`, so old `chatMetadata` blobs round-trip losslessly through the same
// `roomOverridesSchema.safeParse` read seam (`domain/chat/contract/metadata.ts`).
/** The house author's-note register depth — "near enough to steer, far enough not to dominate"
 *  (chat-crew-design/04); the default when the stored directive carries no `depth`. */
export const AUTHORS_NOTE_DEFAULT_DEPTH = 4;
/** The default author's-note role when the stored directive carries no `role`. */
export const AUTHORS_NOTE_DEFAULT_ROLE: MessageRole = "system";

/** The room author's note as the shared `{depth?, role?, prompt}` directive; a legacy bare string is coerced
 *  to `{prompt}` by {@link roomAuthorsNoteSchema} BEFORE this runs, so the guard only ever sees the object.
 *  D66-B (W5, ruling A): the assistant\@depth-0 prefill WRITE-reject is REMOVED — authored prefill is
 *  persistable; the SHAPE delivery gate normalizes it on a `assistantPrefill:false` model. Shape only. */
const roomAuthorsNoteDirectiveSchema = injectionDirectiveSchema.partial().extend({ prompt: overrideField });

/** The stored room author's note: the shared injection directive, coercing a LEGACY bare string → `{prompt}`
 *  so pre-#22 `chatMetadata` blobs round-trip losslessly (the migration seam). */
export const roomAuthorsNoteSchema = z.preprocess((raw) => (typeof raw === "string" ? { prompt: raw } : raw), roomAuthorsNoteDirectiveSchema);
export type RoomAuthorsNote = z.infer<typeof roomAuthorsNoteSchema>;

/** The host-only per-room overrides — exactly four fields ("jailbreak" IS post_history). `.strict()`
 *  default-denies a stray key (an enforcer, not prose). Each field absent ⇒ inherit the card/scope
 *  fallback (resolved in SHAPE — INERT here). Stored in `chatMetadata` (an FK-clean JSON sub-blob).
 *  `authorsNote` is the at-depth injection directive ({@link roomAuthorsNoteSchema}); the other three are
 *  plain text overrides. */
export const roomOverridesSchema = z
  .object({
    scenario: overrideField.optional(),
    mainPrompt: overrideField.optional(),
    postHistory: overrideField.optional(),
    authorsNote: roomAuthorsNoteSchema.optional(),
  })
  .strict();
export type RoomOverrides = z.infer<typeof roomOverridesSchema>;

/** Empty ⇒ inherit everything (the off path is byte-identical). */
export const DEFAULT_ROOM_OVERRIDES: RoomOverrides = {};

// ── Member card visibility (D22 — the host-set per-room dial) ──
/** How much of a roster character's card a present human member may read (Part III §11; D22). Levels
 *  widen left→right: `name-avatar` (the conservative floor) → `sheet` (presentable identity) → `sheet+lore`
 *  (+ the character's world-info) → `full` (+ prompt-steering internals). Host-set; the owner/host always
 *  sees `full`; the member view is read-only + while-present. */
export const MEMBER_CARD_VISIBILITY_LEVELS = ["name-avatar", "sheet", "sheet+lore", "full"] as const;
export type MemberCardVisibility = (typeof MEMBER_CARD_VISIBILITY_LEVELS)[number];
export const memberCardVisibilitySchema = z.enum(MEMBER_CARD_VISIBILITY_LEVELS);

// ── Group config (the `chatMetadata.group` sub-blob) ──
/** The canonical arbitration-policy union (spine §5.5 — ONE importable tuple; the derived Select items +
 *  a total `Record` label map in `group-config-form.tsx` fail `tsc` when a member is added/renamed). The
 *  `.catch().default()` on the schema hides `.options`, so the tuple is the shared source, not the enum. */
export const GROUP_POLICIES = ["natural", "list", "pooled", "manual", "smart"] as const;
export type GroupPolicy = (typeof GROUP_POLICIES)[number];
/** Arbitration policy (WHO speaks each round). `@mention` is NOT a policy value — it is a hard override
 *  applied BEFORE the policy. `smart` (side-LLM) falls back to `natural` until wired. */
export const groupPolicySchema = z.enum(GROUP_POLICIES).catch("natural").default("natural");

// Auto-mode (opt-in AI→AI chaining) — MUST live on BOTH union arms (the narrator arm is `.strict()`).
// Defaults make the OFF path byte-identical (no timer / no auto-turn / no scheduling).
const AUTO_MODE_MAX_TURNS_MIN = 1;
const AUTO_MODE_MAX_TURNS_MAX = 20;
const AUTO_MODE_MAX_TURNS_DEFAULT = 6;
const AUTO_MODE_DELAY_MS_MIN = 0;
const AUTO_MODE_DELAY_MS_MAX = 60_000;
const AUTO_MODE_DELAY_MS_DEFAULT = 1500;
const autoModeFields = {
  autoMode: z.boolean().catch(false).default(false),
  autoModeMaxTurns: z
    .number()
    .int()
    .min(AUTO_MODE_MAX_TURNS_MIN)
    .max(AUTO_MODE_MAX_TURNS_MAX)
    .catch(AUTO_MODE_MAX_TURNS_DEFAULT)
    .default(AUTO_MODE_MAX_TURNS_DEFAULT),
  autoModeDelayMs: z
    .number()
    .int()
    .min(AUTO_MODE_DELAY_MS_MIN)
    .max(AUTO_MODE_DELAY_MS_MAX)
    .catch(AUTO_MODE_DELAY_MS_DEFAULT)
    .default(AUTO_MODE_DELAY_MS_DEFAULT),
  allowSelfResponses: z.boolean().catch(false).default(false),
} as const;

// The synthetic group character's identity id (Part III §10) — narrator turns are AUTHORED by it (a real
// id, never NULL). Optional KEY (absent until minted); on BOTH arms (the narrator arm is `.strict()`).
const groupCharacterIdField = {
  groupCharacterId: typeIdSchema(ID_PREFIX.character).optional(),
} as const;

// `memberCardVisibility` (D22) — host-set, default `sheet`; on BOTH arms (narrator is `.strict()`).
const memberCardVisibilityField = {
  memberCardVisibility: memberCardVisibilitySchema.catch("sheet").default("sheet"),
} as const;

/** Per-room generation behavior. `output` is the discriminator: a `narrator` turn voices the whole cast in
 *  one message and has NO per-speaker card-scope — the `narrator ⇒ merged` constraint is made
 *  unrepresentable by OMITTING `cardScope` from that arm (and `.strict()` REJECTS a stray `cardScope`, an
 *  enforcer not prose). `per-speaker` (default) emits one message per speaker and carries `cardScope`. */
export const groupConfigSchema = z.discriminatedUnion("output", [
  z
    .object({
      output: z.literal("narrator"),
      policy: groupPolicySchema,
      speakerTags: z.boolean().catch(true).default(true),
      groupNudge: z.boolean().catch(true).default(true),
      ...autoModeFields,
      ...groupCharacterIdField,
      ...memberCardVisibilityField,
    })
    .strict(),
  z.object({
    output: z.literal("per-speaker"),
    policy: groupPolicySchema,
    cardScope: z.enum(["merged", "scoped"]).catch("merged").default("merged"),
    speakerTags: z.boolean().catch(false).default(false),
    groupNudge: z.boolean().catch(true).default(true),
    ...autoModeFields,
    ...groupCharacterIdField,
    ...memberCardVisibilityField,
  }),
]);
export type GroupConfig = z.infer<typeof groupConfigSchema>;
/** The LENIENT input (pre-default): callers may omit the defaulted knobs; `setGroupConfig` parses to
 *  {@link GroupConfig} before persisting, so a stored blob is always fully-defaulted. */
export type GroupConfigInput = z.input<typeof groupConfigSchema>;

/** The default room behavior (Part III §7): per-speaker × merged, natural arbitration, no speaker tags,
 *  group-nudge on, auto-mode OFF, member cards visible at `sheet` (D22). */
export const DEFAULT_GROUP_CONFIG: GroupConfig = {
  output: "per-speaker",
  policy: "natural",
  cardScope: "merged",
  speakerTags: false,
  groupNudge: true,
  autoMode: false,
  autoModeMaxTurns: AUTO_MODE_MAX_TURNS_DEFAULT,
  autoModeDelayMs: AUTO_MODE_DELAY_MS_DEFAULT,
  allowSelfResponses: false,
  memberCardVisibility: "sheet",
  // groupCharacterId omitted — a clean optional key, absent until the synthetic group character is minted.
};

// ── Opening policy (HOW a new room opens — the start-chat union) ──
/** Opening policy for a chat's founding cast. `greet-all` = each founding AI greets (the group default);
 *  `generate` = the model writes a cast-aware opening; `none` = seed no greeting; `first-message` = the
 *  solo degenerate (the primary's greeting at seq 1). No `.catch`/`.default`: optional at every boundary,
 *  the server resolves absent → greet-all-vs-first-message by roster size. */
export const openingPolicySchema = z.enum(["greet-all", "generate", "none", "first-message"]);
export type OpeningPolicy = z.infer<typeof openingPolicySchema>;

/** The parsed `chats.metadata` room-behavior blob (D16). No single schema spans it — the column composes
 *  independently fault-isolated sub-blobs, each optional (absent ⇒ the consumer applies its canonical
 *  default; the off-path is byte-identical). ONE HOME here in `contracts` so the `db` `$type` and the
 *  server parser (`domain/chat/contract/metadata.ts` — the runtime lenient-parse machinery) share the shape
 *  instead of re-spelling it. */
export interface ChatMetadata {
  group?: GroupConfig;
  roomOverrides?: RoomOverrides;
  opening?: OpeningPolicy;
  providerRouting?: OpenRouterProviderRouting;
  /** A chat-level knob (in a multi-human room the loop spends the host's money, so the funder tunes it). */
  toolRecurseLimit?: number;
  /** The host's per-document databank retrieval-visibility override (D85 — the membership-widened chat scope's
   *  governance knob). Absent ⇒ nothing hidden. Written by the host-gated `chat.setChatDocumentVisibility`
   *  verb; READ by `databank/persistence/scope.ts` (the union filter). Schema is databank's (documentId vocab)
   *  — the providerRouting precedent. */
  databankVisibility?: ChatDocumentVisibility;
  /** BG-C — the host-set per-chat carried BACKGROUND source. Absent ⇒ no chat background (the card-carried
   *  twin, then the viewer's own appearance, wins). Written ONLY by the host-gated `chat.setChatBackground`
   *  verb; READ client-side (getChat carries it), applied at the app-root background layer in a TRUE-SOLO room.
   *  Schema is theme's (`ThemeBackground`) — the providerRouting/databankVisibility precedent. */
  background?: ThemeBackground;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE UNIFIED-ROSTER WIRE (D16) — the participant roster, the membership-gated member card (D22), invites,
// and the group-macro context. The LIFECYCLE logic is `domain/chat`; these are just the wire shapes.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The `participantRoleSchema` Zod enum over the ONE-HOME `host|member` axis. ONE HOME (PD-59): the tuple +
 *  `ParticipantRole` type are DEFINED in `@orb/contracts/identity` (`can()` reads them; identity is the DAG
 *  root) — every consumer imports them from there (no second name, no alias); this only derives the schema. */
export const participantRoleSchema = z.enum(PARTICIPANT_ROLES);

/** How much history a (re)joining member sees: `from-join` (only from their `joinSeq`) or `full`. */
export const JOIN_HISTORY_VISIBILITIES = ["from-join", "full"] as const;
export type JoinHistoryVisibility = (typeof JOIN_HISTORY_VISIBILITIES)[number];
export const joinHistoryVisibilitySchema = z.enum(JOIN_HISTORY_VISIBILITIES);

const TALKATIVENESS_MIN = 0;
const TALKATIVENESS_MAX = 1;
/** The default talkativeness weight (Part III §1) — the natural-arbitration sampling weight. */
export const TALKATIVENESS_DEFAULT = 0.5;
/** The 0–1 talkativeness weight schema (default {@link TALKATIVENESS_DEFAULT}). */
export const talkativenessSchema = z.number().min(TALKATIVENESS_MIN).max(TALKATIVENESS_MAX).catch(TALKATIVENESS_DEFAULT).default(TALKATIVENESS_DEFAULT);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE ROSTER-MEMBER VOCABULARY (D80 — the participant five-plane model). Homed HERE (chat owns the
// runtime seats + already exports PARTICIPANT_KINDS / SpeakerRef / GroupConfig; roster-preset imports from
// chat, identity stays the DAG root). Defined below talkativenessSchema so the value reference resolves.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** The knobs every AI seat carries — ONE home (D80). Presets, founding casts, and the participantId-keyed
 *  `setSeatKnobs` verb project this shape; the per-kind knob-verb forking is retired (it guaranteed skipped
 *  arms — the mute + talkativeness gaps proved the class). `talkativeness` absent = inherit the chat default
 *  ({@link TALKATIVENESS_DEFAULT}); the RANGE clamp is the raw `talkativenessSchema` (0–1). */
export const seatKnobsSchema = z.object({
  talkativeness: z.number().min(TALKATIVENESS_MIN).max(TALKATIVENESS_MAX).optional(),
  disabled: z.boolean().optional(),
});
export type SeatKnobs = z.infer<typeof seatKnobsSchema>;

/** The `character` arm of {@link rosterMemberSpecSchema} — extracted so a surface that persists characters
 *  ONLY (roster presets v1, RP-D1) narrows to it without re-spelling the shape (derive, one home). A card
 *  seat: a `characterId` + `position` + the AI-seat knobs. */
export const characterMemberSpecSchema = z.object({
  kind: z.literal("character"),
  characterId: typeIdSchema(ID_PREFIX.character),
  position: z.number().int().nonnegative(),
  ...seatKnobsSchema.shape,
});
export type CharacterMemberSpec = z.infer<typeof characterMemberSpecSchema>;

/** A seat the caller WANTS to exist — the ONE template/creation-time member vocabulary (D16/D61/D60; D80).
 *  Every membership-template lifetime (roster presets, founding casts, saved-rosters v2) PROJECTS through
 *  this shape; nothing mints a flat characterId array beside it. Kind-discriminated like {@link SpeakerRef}.
 *  `human` is UNREPRESENTABLE by design (invites are the only human join path — a template cannot carry an
 *  invite's runtime preconditions; D80); `observer` is reserved/un-seatable. The `character` and `agent`
 *  arms are both live from birth — a surface that only persists one arm NARROWS the vocabulary (RP-D1),
 *  never a private re-spell. */
export const rosterMemberSpecSchema = z.discriminatedUnion("kind", [characterMemberSpecSchema]);
export type RosterMemberSpec = z.infer<typeof rosterMemberSpecSchema>;

/** The RESOLVED per-participant content-render policy (D44 §12.0/§12.3) — `override ?? global`. The chat
 *  domain resolves each character's tri-state overrides against the deployment effective config at
 *  roster-build time (the ONE resolution home — never re-resolved client-side); the client READS these to
 *  pick the markdown render trust tier + gate external media for content THIS participant authored. Both
 *  fields are non-null (already resolved). */
export interface RenderPolicy {
  /** `true` = this participant's card/message HTML renders TRUSTED (rich HTML + Mermaid). Floor: `false`
   *  (untrusted — the D21 safe default; an admin-global or per-character opt-in escalates). */
  readonly trustHtml: boolean;
  /** `true` = external (http/https) media in this participant's content is gated behind click-to-load
   *  (the load itself is the tracking-pixel/exfil — D44 §12.3). */
  readonly forbidExternalMedia: boolean;
}

/** The roster read-model (one `chat_participants` row, resolved for display). `kind` (∈ PARTICIPANT_KINDS)
 *  drives the identity + column shape per the 4-way `chat_participants_kind_shape` CHECK: `human`/`agent` carry
 *  `userId`, `character` carries `characterId`, `observer` neither (the old 2-way XOR was replaced at AP0).
 *  `talkativeness`/`disabled` feed arbitration; `disabled` also drops a CHARACTER from `{{groupNotMuted}}`
 *  (agents are never in the group macros); `leftSeq` null = present (the "present-and-contributing" predicate). */
export interface ParticipantView {
  id: ChatParticipantId;
  chatId: ChatId;
  kind: ParticipantKind;
  userId: UserId | null;
  characterId: CharacterId | null;
  role: ParticipantRole;
  activePersonaId: PersonaId | null;
  talkativeness: number;
  disabled: boolean;
  joinedAt: number;
  joinSeq: number;
  leftSeq: number | null;
  joinHistoryVisibility: JoinHistoryVisibility;
  /** Resolved display name — one rule, no raw id ever (R10): a human's publics displayName (else handle, else
   *  a removed-member label); a character's card name (else a removed-character label); an agent's resolved soul
   *  name (else its `sourceKind` label for an unhatched buddy). */
  displayName: string;
  /** A human's public handle (null for an agent/character). */
  handle: Handle | null;
  /** The avatar asset (the floor — always member-visible via the D21 blob route's roster exception). */
  avatarAssetId: AssetId | null;
  /** The CAS hash of `avatarAssetId` (`assets.hash`, joined server-side) — `blobUrl(avatarHash)` is the
   *  renderable `<img src>`; `null` when `avatarAssetId` is null OR the asset row is gone. Kept a SIBLING
   *  field (never derived client-side — the client has no id→hash resolver, #67). */
  avatarHash: string | null;
  /** The RESOLVED content-render policy for content THIS participant authored (D44 §12.0 — see
   *  {@link RenderPolicy}). ALWAYS server-populated on the `getChat`/roster read; declared OPTIONAL so a
   *  partial/legacy payload or a not-yet-migrated test literal fails CLOSED at the client (absent ⇒ the
   *  untrusted + gate-external safe floor), never fails open. */
  renderPolicy?: RenderPolicy;
  /** D44 §12.1/§12.5 — the RAW per-character theme-token override (`character.themeOverride`, threaded
   *  through unmerged — themes-design.md §1: chat assembly never reads the `themes` table). `null` = no
   *  override for a character seat, or always `null` for a human seat. Resolution to "character over
   *  global over default" is a CLIENT ThemeScope NESTING concern (a per-speaker scope wrapping the root
   *  scope — `clampThemeTokens` only emits present fields, so the CSS custom-property cascade does the
   *  merge for free); the client nests a per-speaker ThemeScope inside the root scope. */
  themeOverride?: ThemeOverride | null;
  /** BG-C — the RAW per-character carried BACKGROUND source (`character.backgroundOverride`, the
   *  `themeOverride` twin), threaded unmerged. `null` = no card background for a character seat, always
   *  `null` for a human/agent seat. In a TRUE-SOLO room (see {@link soleTrueSoloCharacter}) the sole
   *  character's carried background takes over the app-root background layer, BELOW the chat-set override;
   *  any other composition leaves it INERT (the viewer's own appearance wins). Resolution lives client-side
   *  in the app-shell background resolver. */
  backgroundOverride?: ThemeBackground | null;
}

/** BG-C true-solo composition — the ONE derivation of "exactly one human and exactly one character, no
 *  other seat", count-derived (never an `isGroup` branch). Returns the sole character's {@link ParticipantView}
 *  when the room is true-solo, else `undefined`. The shared home so the per-speaker THEME takeover
 *  (`resolveRoomTheme`, client attribution) and the per-chat BACKGROUND takeover (the app-shell background
 *  resolver) can never drift to two spellings of the same rule. */
const SOLO_COUNT = 1;
const TRUE_SOLO_SEATS = 2;
export function soleTrueSoloCharacter(participants: readonly ParticipantView[] | undefined): ParticipantView | undefined {
  if (participants === undefined) {
    return;
  }
  let humanCount = 0;
  let characterCount = 0;
  let soleCharacter: ParticipantView | undefined;
  for (const participant of participants) {
    if (participant.kind === "human") {
      humanCount += 1;
    } else {
      characterCount += 1;
      soleCharacter = participant;
    }
  }
  const trueSolo = humanCount === SOLO_COUNT && characterCount === SOLO_COUNT && participants.length === TRUE_SOLO_SEATS;
  return trueSolo ? soleCharacter : undefined;
}

/** The membership-gated, level-clamped PUBLIC card projection (D22 — Part III §11). Fields above the
 *  effective `visibility` level are `null` (the ONE producer is chat's `clampMemberCard` —
 *  substrate/auth/clamp.ts, PD-111 — keyed to `chatMetadata.group.memberCardVisibility`; the host always
 *  gets `full`). Read-only +
 *  while-present; viewing ≠ owning (edit/clone/export stay owner-only). Self-contained — it is a clamped
 *  PROJECTION, not the full `CharacterCard`, so `chat` needs no `→ character` edge for it. */
export interface MemberCardView {
  characterId: CharacterId;
  /** The level this projection was clamped to — the consumer reads it to know which fields are populated. */
  visibility: MemberCardVisibility;
  // ── name-avatar floor (always present) ───────────────────────────────────
  name: string;
  avatarAssetId: AssetId | null;
  /** The CAS hash of `avatarAssetId` — see {@link ParticipantView.avatarHash}. Same always-present floor
   *  as `avatarAssetId` (never clamped by `visibility`). */
  avatarHash: string | null;
  // ── sheet (>= `sheet`) ───────────────────────────────────────────────────
  description: string | null;
  personality: string | null;
  scenario: string | null;
  greetings: string[] | null;
  exampleMessages: string | null;
  tags: string[] | null;
  creatorNotes: string | null;
  // ── sheet+lore (>= `sheet+lore`) ─────────────────────────────────────────
  /** The character's world-info entry contents (rendered), or null below `sheet+lore`. */
  lore: string[] | null;
  // ── full (== `full`): the prompt-steering internals ──────────────────────
  systemPrompt: string | null;
  postHistoryInstructions: string | null;
  authorsNoteDepth: number | null;
}

// ── Invites & the membership chokepoint (Part III §2; D16) ──
const INVITE_MAX_USES_MIN = 1;
const INVITE_MAX_USES_MAX = 10_000;
const INVITE_TOKEN_MIN = 1;

/** Invite lifecycle status (the db `chat_invites.status` column mirrors this). */
export const INVITE_STATUSES = ["pending", "accepted", "declined", "revoked", "expired"] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];
export const inviteStatusSchema = z.enum(INVITE_STATUSES);

/** Create an invite (host action). Two creation paths: a share-link (no target) OR targeted-by-handle
 *  (`invitedHandle`, resolved to a user server-side). The `token` is CSPRNG-minted + stored HASHED on the
 *  server — NEVER a client input, never returned in a view. `role` is server-forced `member` on redeem. */
export const createInviteSchema = z.object({
  maxUses: z.number().int().min(INVITE_MAX_USES_MIN).max(INVITE_MAX_USES_MAX).optional(),
  expiresAt: z.number().int().nullable().optional(),
  /** Targeted-by-handle: the exact public handle to invite (no user directory/listing). */
  invitedHandle: brandedId<Handle>().nullable().optional(),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

/** Preview an invite before confirming (the accept = preview-then-confirm flow). Carries the raw token. */
export const previewInviteSchema = z.object({
  token: z.string().min(INVITE_TOKEN_MIN),
});
export type PreviewInviteInput = z.infer<typeof previewInviteSchema>;

/** Redeem an invite (the ONE participant-insert chokepoint, atomic). Carries the raw token. */
export const redeemInviteSchema = z.object({
  token: z.string().min(INVITE_TOKEN_MIN),
});
export type RedeemInviteInput = z.infer<typeof redeemInviteSchema>;

/** Accept a TARGETED invite by its id — the in-app notification→accept path (the token-free twin of
 *  `redeemInviteSchema`). No raw token: the invitee's own authenticated identity is the authorization (the
 *  invite is BOUND to their `invitedUserId`), so the `/join/:token` link never has to leave the app. Keyed by
 *  the `inviteId` the durable `invite` notification carries — the same handle `declineInvite` takes. A
 *  share-link (untargeted) invite is NOT acceptable by id (token-only); a foreign/invalid id is a leak-free
 *  NOT_FOUND downstream. */
export const acceptInviteSchema = z.object({
  inviteId: brandedId<ChatInviteId>(),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

/** The preview-then-confirm result — deliberately MINIMAL: room name / host handle / member COUNT / mode
 *  label ONLY. NO roster identities, NO history (Part III §2 — those replay from `joinSeq` AFTER accept). */
export interface InvitePreview {
  chatId: ChatId;
  roomName: string;
  hostHandle: Handle;
  memberCount: number;
  /** A human-readable mode label (e.g. the output × policy summary) — never the raw config. */
  modeLabel: string;
}

/** An invite as the host manages it. NEVER carries the token (raw or hashed) — a leak would let anyone
 *  redeem. `remainingUses` is `maxUses` minus redemptions (null = unlimited). */
export interface InviteView {
  id: ChatInviteId;
  chatId: ChatId;
  status: InviteStatus;
  maxUses: number | null;
  remainingUses: number | null;
  expiresAt: number | null;
  /** The targeted user when created by handle; null for an open share-link. */
  invitedUserId: UserId | null;
  createdAt: number;
}

// ── Message content blocks (D44 §12.4) ────────────────────────────────────────────────────────────
// A message body is a typed SEQUENCE of content blocks, NOT one HTML string (ST's fatal simplification).
// This is the RENDER model — how a stored message is *displayed*. It is distinct from the provider-send
// model (`ChatHistoryMessage.content` → content-parts, D45 — what the model receives as input); the two
// share one stored asset but are different contracts in opposite directions. Chat assembles these (P5).

export const messageMediaKindSchema = z.enum(["image", "audio", "video"]);
export type MessageMediaKind = z.infer<typeof messageMediaKindSchema>;

/** Tier-A = inert sanitized allowlist in the main DOM; Tier-B = sandboxed-iframe card (client.md §12.2). */
export const cardTrustSchema = z.enum(["tierA", "tierB"]);
export type CardTrust = z.infer<typeof cardTrustSchema>;

/** Where a media block's bytes come from: an owned asset (per-user CAS, D21) or an external URL (gated by
 *  `forbidExternalMedia` at render, D44 §12.3 — never auto-loaded for untrusted content). */
export const messageMediaSrcSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("asset"), assetId: typeIdSchema(ID_PREFIX.asset) }),
  z.object({ kind: z.literal("external"), url: z.string() }),
]);
export type MessageMediaSrc = z.infer<typeof messageMediaSrcSchema>;

/** The typed message-content block union. `html-card` carries its own trust tier; `media` covers image +
 *  native audio/video; `markdown` is the default text path. (D44 §12.4 — born-compliant before Phase 5.) */
export const messageContentBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("markdown"), md: z.string() }),
  z.object({
    kind: z.literal("media"),
    media: messageMediaKindSchema,
    src: messageMediaSrcSchema,
    alt: z.string(),
    dims: z.object({ w: z.number(), h: z.number() }).optional(),
  }),
  z.object({
    kind: z.literal("html-card"),
    html: z.string(),
    css: z.string().optional(),
    trust: cardTrustSchema,
  }),
]);
export type MessageContentBlock = z.infer<typeof messageContentBlockSchema>;

/**
 * Project kit content spans (`@orb/kit/content` `tokenizeContent` — the ONE ref grammar, D51) into
 * the D44 render blocks: consecutive text spans join into one `markdown` block; image spans become
 * `media` blocks (`external` refs are rendered through the gated `MessageMedia`, never a raw
 * `<img>` — D44 §12.3). The `html-card` extraction grammar is NOT parsed here — it lands with the
 * chat-content wiring that defines how a card is embedded in a stored body (the union member is
 * born-compliant; this projection covers the markdown + media classes the D51 grammar defines).
 *
 * STORED-CONTENT PROJECTIONS DEGRADE, NEVER THROW (ratified doctrine). The input spans come from a
 * persisted, arbitrary model/user-authored body (any member can type — and any model can emit —
 * `![alt](asset:<not-a-typeid>)`; the send path neither does nor should reject body prose). The kit
 * tokenizer cannot carry the TypeID brand (the cake), so the `asset` arm re-validates the brand at
 * this seam — but a `.parse` throw here fires INSIDE React render with no per-row boundary, so one
 * malformed persisted ref would crash the whole app on every open of that chat, forever (an
 * unrecoverable state authored from stored data). A ref that fails the brand therefore DEGRADES to the
 * raw image markdown as a text block (the author's bytes are preserved; the gated media path is
 * reserved for well-branded refs) — matching the server twin `toContentParts`, which drops a bad/gone
 * ref rather than throwing. This projection NEVER throws on persisted content.
 */
export function contentSpansToBlocks(spans: readonly ContentSpan[]): MessageContentBlock[] {
  const blocks: MessageContentBlock[] = [];
  let pendingText = "";
  const flushText = (): void => {
    if (pendingText.length > 0) {
      blocks.push({ kind: "markdown", md: pendingText });
      pendingText = "";
    }
  };
  for (const span of spans) {
    if (span.kind === "text") {
      pendingText += span.text;
      continue;
    }
    flushText();
    if (span.ref.kind === "external") {
      blocks.push({
        kind: "media",
        media: "image", // the D51 grammar embeds images; native a/v arrives via html-card/native paths
        src: { kind: "external", url: span.ref.url },
        alt: span.alt,
      });
      continue;
    }
    const branded = typeIdSchema(ID_PREFIX.asset).safeParse(span.ref.assetId);
    if (branded.success) {
      blocks.push({
        kind: "media",
        media: "image",
        src: { kind: "asset", assetId: branded.data },
        alt: span.alt,
      });
      continue;
    }
    // Degrade a malformed persisted asset ref to its literal markdown (never throw — see header).
    blocks.push({ kind: "markdown", md: `![${span.alt}](asset:${span.ref.assetId})` });
  }
  flushText();
  return blocks;
}

// ── Bulk import (Option B) — the chat-OWNED bulk-import op input. `import` maps its ST parse (`ParsedChat`,
//    which stays import-owned) onto these CANONICAL chat shapes and calls `chat`'s `createBulkImportChats`
//    op; the chat op learns nothing about SillyTavern. Persona attribution is pre-resolved to ids by import
//    (so the op is persona-agnostic). A cross-boundary shape shared by import + chat → contracts (D34). ──

/** One resolved variant (swipe) row for a bulk-imported message (D26 — the SELECTED variant carries the
 *  rendered content). `idx` is 0-based within the slot's pool; the economics subset is what an ST import
 *  carries (the rest of `message_variants` stays null). */
export interface BulkImportVariantInput {
  readonly idx: number;
  readonly content: string;
  readonly model: string | null;
  readonly provider: string | null;
  readonly tokensOut: number | null;
  readonly reasoning: string | null;
  readonly ttftMs: number | null;
  readonly genStartedAt: number | null;
  readonly genFinishedAt: number | null;
  readonly metadata: Record<string, unknown> | null;
}

/** One resolved message slot for a bulk-imported chat. Attribution is SLOT-level (D26): the chat op stamps
 *  `authorUserId` (user turns) / `characterId` (assistant turns) itself from the run's owner/character;
 *  `personaId` is pre-resolved by import (the persona the user RP'd as, or null). `selectedIdx` selects the
 *  rendered variant out of `variants`. */
export interface BulkImportMessageInput {
  readonly role: MessageRole;
  readonly createdAt: number;
  readonly personaId: PersonaId | null;
  readonly variants: readonly BulkImportVariantInput[];
  readonly selectedIdx: number;
}

/** One resolved chat to bulk-import into an existing character. The SUPERSET shape — every field
 *  `export/verbs/export-chat.ts` round-trips out of the db, so an orbweaver export re-imports losslessly
 *  (plain ST is the lossy subset: orb-only fields arrive empty). `importHash` is the per-chat dedup oracle
 *  (`chats.importHash`); `updatedAt` is the ST last-activity (import computes `Math.max(send_dates)`, not
 *  `now`); `parentRef` is the branch parent's source filename (resolved character-wide by the op);
 *  `authorsNote` is the ST `note_prompt` → `chats.metadata.roomOverrides.authorsNote` (the typed home export
 *  reads back); `isRealConversation` gates the memory-backfill enqueue (PD-78). */
export interface BulkImportChatInput {
  readonly title: string;
  readonly importedFrom: string;
  readonly importHash: string;
  readonly anchorPersonaId: PersonaId | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly parentRef: string | null;
  readonly authorsNote: string | null;
  readonly isRealConversation: boolean;
  readonly messages: readonly BulkImportMessageInput[];
}

/** The tallies `createBulkImportChats` returns for one bulk-import run. `realConversationWritten` is the
 *  PD-78 backfill gate (import enqueues ONE `memory-backfill` when true). */
export interface BulkImportChatsResult {
  readonly chatsImported: number;
  readonly chatsSkipped: number;
  readonly messagesImported: number;
  readonly variantsImported: number;
  readonly branchesLinked: number;
  readonly realConversationWritten: boolean;
}
