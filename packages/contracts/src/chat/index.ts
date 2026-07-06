// @orb/contracts/chat — the largest contracts node: the chat-message role schema, the D26 message/variant
// wire contract, the ASSEMBLE family, the chat stream-delta + bus union, the (formerly misfiled) room /
// group / opening shapes, and the D16 unified-roster wire (invites, roster, member-card, group macros).
//
// LAYER 2 — depends on the Layer-0/1 contracts it imports DOWN:
//   • `#world-info` (`WiBusEvent` — embedded in `ChatBusEvent`; `WorldInfoScope` — an assemble-entry field).
//   • `#preset` (`PromptConfig` — `AssembleContext` builds against it; `GenerationType` — the turn gate;
//      `UserIntent` — a variant's recorded generation params, D26).
//   • `#connection` (`ChatApi`/`ChatSource` — the `turnStarted` bus event's protocol + provider-source).
//   • `@orb/kit/message-role` (the `MESSAGE_ROLES` tuple — `messageRoleSchema = z.enum(MESSAGE_ROLES)`, D32;
//      the canonical role axis. The tuple lives in kit; THE wire schema lives HERE — the §5 tuple-in-kit rule).
//   • `@orb/kit/injection` (`InjectionPlacement` — the shared `{depth, role}` at-depth shape, D32).
//   • `@orb/kit/ids` (the branded ids + the `brandedId`/`typeIdSchema` boundary schemas).
//
// LAWS honored here:
//   • Turn identity (D19): a wire shape that carries turn attribution uses `triggeredBy`/`runAsUserId`,
//     NEVER `callerUserId` (the caller is `Principal.userId`). The bus events here carry no caller id.
//   • No `chats.ownerId` (D18): chats are membership-scoped; the host participant is the authority. No wire
//     shape here stamps a chat owner.
//   • Bus-payload allowlist: credentials / secrets / baseUrls are TYPE-LEVEL
//     UNREPRESENTABLE in `ChatBusEvent` — every member is a closed object literal of branded ids, enum
//     literals, plain scalars, and `MessageView`; there is no `unknown`/`Record`/index field a secret could
//     ride in. The `.contract.test` pins this at the type level.
//   • D26: `messages` is a pure SLOT (no content/economics); all generation content lives on
//     `message_variants`. `MessageView` is the slot joined with its selected variant.
//   • D22: `memberCardVisibility` is a host-set dial on `groupConfigSchema` (default `sheet`).

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
import type { RowCharacterName, RowPersonaName, VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { z } from "zod";
import type { ChatApi, ChatSource } from "#connection";
import type { ParticipantRole } from "#identity";
import { PARTICIPANT_ROLES } from "#identity";
import type { GenerationType, PromptConfig, UserIntent } from "#preset";
import type { RegexScript } from "#regex";
import type { WiBusEvent, WorldInfoScope } from "#world-info";

// ── The roster participant kind (the chat-roster discriminator) ───────────────
// `human`/`character` are the v1 kinds. `agent` (first-class agent principal — userId-backed AND AI-driven)
// is born at AP0 (D60; agent-principal-design/02 §1): the `chat_participants` XOR CHECK becomes a per-kind
// SHAPE CHECK to represent it. `observer` stays the reserved seam (the per-chat Narrative Director — watches
// + proposes, never acts; still un-seatable, no insert path).
// FLAG[PD-17]: the `agent` MEMBER + its DDL shape are born at AP0; a seat is UN-fillable until `chat.seatAgent`
// (AP3). The AI-driven/user-backed derived kind-sets (`AI_DRIVEN_KINDS`/`USER_BACKED_KINDS` + `isAiDriven`) land
// at AP2 WITH their sole consumer — the arbitration speaker-identity generalization (`select-speakers`/`round`
// are `CharacterId`-keyed; an agent needs a speaker-ref). Deferred here per no-dead-branches until that lands.
export const PARTICIPANT_KINDS = ["human", "character", "agent", "observer"] as const;
export type ParticipantKind = (typeof PARTICIPANT_KINDS)[number];
export const participantKindSchema = z.enum(PARTICIPANT_KINDS);

// ── The AI-driven kind-set (D60; agent-principal-design/02 §1.1) ──────────────────────────────────────────
// `kind` carries TWO facts the old XOR welded together: the identity table (userId vs characterId) AND who
// DRIVES the seat. `AI_DRIVEN_KINDS` splits out the DRIVE axis — the seats the engine schedules/voices
// (arbitration ranks them; a turn is generated for them). An agent is AI-driven AND userId-backed — the exact
// combination the XOR could not represent. The `satisfies readonly ParticipantKind[]` makes a 5th kind fail
// `tsc` here until it declares its axis. `USER_BACKED_KINDS` is the human/agent shared column shape (both FK
// `users`) — consumed by the present-and-contributing predicate's principal-`enabled` read (AP3-2, doc 02 §1.1).
export const AI_DRIVEN_KINDS = ["character", "agent"] as const satisfies readonly ParticipantKind[];
export const USER_BACKED_KINDS = ["human", "agent"] as const satisfies readonly ParticipantKind[];
export const isAiDriven = (k: ParticipantKind): boolean =>
  (AI_DRIVEN_KINDS as readonly ParticipantKind[]).includes(k);
export const isUserBacked = (k: ParticipantKind): boolean =>
  (USER_BACKED_KINDS as readonly ParticipantKind[]).includes(k);

/** The identity of ONE AI-driven speaker (D60) — the cross-cutting speaker reference the arbitration,
 *  assembly (per-speaker card selection), and persist paths all key on. A `character` FKs `characters.id`;
 *  an `agent` FKs its `users` row (self-attributed: `authorUserId` = the agent, `characterId` NULL). An agent
 *  has no characterId, so anything per-speaker keys on THIS ref. NOT a Set/Map key directly — use
 *  {@link speakerKey} (a struct is not value-comparable). */
export type SpeakerRef =
  | { readonly kind: "character"; readonly characterId: CharacterId }
  | { readonly kind: "agent"; readonly userId: UserId };

/** The stable string key for a {@link SpeakerRef} (Set membership + equality). Kind-prefixed so a characterId
 *  and a userId can never collide. Pure; deterministic. */
export function speakerKey(ref: SpeakerRef): string {
  return ref.kind === "character" ? `c:${ref.characterId}` : `a:${ref.userId}`;
}

/** The RESOLVE-phase product for an AGENT speaker (D60, doc 04 §5) — "the card-shape minus the card." Chat
 *  voices an agent by mapping THIS onto an `AssembleCharacter` (`name`←displayName, `systemPrompt`←the soul
 *  prompt) at RESOLVE, so the agent rides the ONE turn path like any character. The source (buddy's soul) is
 *  resolved through an injected `resolveAgentSpeaker` op — chat stays source-blind. */
export interface AgentSpeakerIdentity {
  /** The soul's display name → speaker labels, macros, cast lists. */
  readonly displayName: string;
  /** `buildBuddySystemPrompt` output (the soul prompt) — replaces the character-card system section. */
  readonly systemPrompt: string;
  /** v1: null (sprites are client-side; widens with the D22 agent card view — doc 04 §5). */
  readonly avatarAssetId: AssetId | null;
}

// ── The chat-message role wire schema (D32 — THE canonical home) ──────────────
// `z.enum(MESSAGE_ROLES)`: the tuple is `@orb/kit/message-role` (a pure isomorphic atom kit resolvers +
// the ST bimap need); the WIRE schema is HERE (the §5 tuple-in-kit rule). Every role field across this node
// (message slot/view, chat injections, assemble entries via `kit/injection`) goes through this one axis —
// no inline re-spell of `system|user|assistant`.
export const messageRoleSchema = z.enum(MESSAGE_ROLES);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ASSEMBLE FAMILY (from neo `shared/prompt/prompt-assemble-types.ts`) — slim assembly projections
// (DAG §1.3): NOT re-exports of the full card/persona/entry shapes. `db/schema/chat.ts.promptSnapshot`
// (a `message_variants` column, D26) and chat verb result types consume these without pulling the assembly
// logic. Types only — the producing engine (`assemblePrompt`/`buildAssembleContext`) is `domain/chat`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** A roster character projected to the fields the ASSEMBLE stage renders — a slim cast projection, NOT the
 *  full `CharacterCard`. `systemPrompt`/`postHistoryInstructions`, when present, REPLACE the matching preset
 *  section in place (`{{original}}` recovers the preset text). */
export interface AssembleCharacter {
  name: string;
  description: string;
  personality?: string | null;
  scenario?: string | null;
  exampleMessages?: string | null;
  systemPrompt?: string | null;
  postHistoryInstructions?: string | null;
}

/** The human-side projection for `{{user}}` resolution. Slim (`{name, description}`) — homed HERE, not
 *  `contracts/persona`, so `chat` keeps the assemble family cohesive without a `chat → persona` edge (DAG
 *  CONFLICT resolved: 3 docs to 1). */
export interface AssemblePersona {
  name: string;
  description: string;
}

/** A world-info entry projected onto the assembler contract. `scope` is the `WorldInfoScope` axis
 *  (`#world-info`); `inject` (opt-in WI-at-depth) reuses the SHARED `InjectionPlacement` `{depth, role}`
 *  primitive (`@orb/kit/injection`, D32) — set ⇒ the always-scope entry splices into history instead of
 *  rendering into the system half. */
export interface AssembleWorldEntry {
  /** Stable entry id — dedup key + priority tiebreaker (priority DESC, id ASC), and the identity
   *  `worldInfoActivated` reports as "fired this turn" (D50 pt-2). Always present — every pool source is
   *  the `worldEntries` PK read (`assembly/world-info/pool.ts`); there is no fixture path that omits it. */
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
export const CHAT_INJECTION_POSITIONS = [
  "before_prompt",
  "in_static",
  "in_prompt",
  "in_chat",
] as const satisfies readonly ChatInjection["position"][];

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
  /** Per-cast-member identity, index-aligned with `cast`. Null for an un-backfilled legacy member. */
  castCharacterIds?: (CharacterId | null)[];
  /** Per-cast-member SPEAKER identity, index-aligned with `cast` (D60) — a `character` or an `agent` (whose
   *  card is its resolved soul). The per-speaker card selection (`shape(ctx, speaker)`) keys on THIS to pick
   *  the active member + the co-speakers; a character-only room's refs are all `{kind:'character'}`. Absent ⇒
   *  a hand-built/legacy ctx (the per-speaker shape falls back to the primary — byte-identical). */
  castMembers?: SpeakerRef[];
  /** The non-muted subset of `cast` — drives `{{groupNotMuted}}`. Absent ⇒ falls back to the full cast. */
  castNotMuted?: AssembleCharacter[];
  /** Who is generating: `single` (per-speaker, `{{char}}` = that character) vs `cast` (narrator, `{{char}}`
   *  = the whole cast). Solo is always `single`. */
  speaker?:
    | { kind: "single"; character: AssembleCharacter }
    | { kind: "cast"; members: AssembleCharacter[]; active: AssembleCharacter };
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
  /** Per-chat ChoiceBlock variable values (the `getvar` map). The D46 merged env seed — the resolved config
   *  picks with the runtime fold cache overlaid — threaded BY REFERENCE so a within-turn `setvar` mutates it in
   *  place. */
  variableValues?: Record<string, string> | undefined;
  /** D46 runtime plane — the ORDERED log of variable mutations the macro engine records this turn (setvar /
   *  incvar / …). Owned per-assembly (one array, threaded BY REFERENCE into every macro context — section
   *  renders + regex/guided — the `env`-by-reference sibling); after the turn it IS the produced variant's
   *  `variable_delta`. Absent means mutations are applied to `variableValues` but not recorded (assembly-only
   *  re-renders / previews / tests). */
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
  /** The effective HOST-TIER regex set (D53) — host-global ∪ chat-preset ∪ cast, resolved under the frozen
   *  `runAsUserId` (D19, never the caller). A RESOLVED cross-domain input (the preset/persona/memory pattern):
   *  the verb/root supplies it, assembly carries it through. Applied at SEND (USER_INPUT, in `buildAssembleContext`)
   *  and RECEIVE (AI_OUTPUT/REASONING, in `engine/pipeline`). Absent ⇒ no host-tier regex this turn. */
  hostTierRegexScripts?: readonly RegexScript[] | undefined;
  /** WI-conversion trace, copied into `AssembleTrace` for the section-preview panel. `entryIds` is the
   *  budget-survived, actually-fired WI entries this turn — the engine emits `worldInfoActivated` from it
   *  (D50 pt-2); it is NOT `matchedKeys` (those are keyword strings, not entry identity). */
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
  maxOutputTokens: number | null;
  ttftMs: number | null;
  finishReason: string | null;
  stopReason: string | null;
  terminalReason: string | null;
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

export const toolCallRecordSchema = z.object({
  // biome-ignore lint/plugin/no-raw-id: PROVIDER-emitted opaque tool-call handle (OpenAI `call_…`/Anthropic id) — never an orbweaver-minted brand; provenance-faithful, joins a tool-call to its result on the wire (tool-use-design/03 §3 types it `string`).
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
  costUsd: number | null;
  ttftMs: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CHAT MACRO NAME PRODUCER (Chat-Macro-Resolution.md §1) — a chat read's member-gated id→name maps,
// so a client can DERIVE per-row `{{char}}`/`{{user}}`/`{{persona}}` names via `@orb/kit/macro`'s
// `resolveRowMacros` (§2). Rows stay id-only (`MessageView.characterId`/`personaId` above) — this is the
// PRODUCER, never a per-row denormalized name (the neo hard-link this doctrine deliberately avoids).
// Names only, not the full entities: any chat member already sees who authored each line (the attribution
// chrome), so a co-participant's persona/character NAME is not a secret this needs to gate further.
//
// Wire-serializable as ARRAYS, not `Map`s: this transport is raw JSON (no superjson transformer wired on
// the tRPC link here), and a `Map` doesn't survive a JSON round-trip. `buildCharacterNameMap`/
// `buildPersonaNameMap` rebuild the `ReadonlyMap` shape `resolveRowMacros` takes, on whichever side reads
// the wire array (client DISPLAY today; server ASSEMBLE builds its own map straight from its DB join —
// no wire hop — but may reuse these builders if it ever needs the same array shape).
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

/** Rebuild the `characterNamesById` lookup `resolveRowMacros` (`@orb/kit/macro`) takes, from the wire
 *  array. Pure; last-write-wins on a duplicate id (a producer is expected to be pre-deduped — this never
 *  throws on a malformed input, it just lets the later entry win). */
export function buildCharacterNameMap(
  entries: readonly CharacterNameEntry[],
): ReadonlyMap<CharacterId, RowCharacterName> {
  return new Map(entries.map((e) => [e.id, { name: e.name }]));
}

/** Rebuild the `personaNamesById` lookup `resolveRowMacros` (`@orb/kit/macro`) takes, from the wire
 *  array. Pure; last-write-wins on a duplicate id (see {@link buildCharacterNameMap}). */
export function buildPersonaNameMap(
  entries: readonly PersonaNameEntry[],
): ReadonlyMap<PersonaId, RowPersonaName> {
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CHAT STREAM DELTA + THE CHAT BUS UNION
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

/** A stream delta wrapped inside a `ChatBusEvent` of `type: "delta"`. */
export type ChatDeltaEvent =
  | { chatId: ChatId; kind: "text"; text: string }
  | { chatId: ChatId; kind: "reasoning"; text: string };

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
] as const;
export type ChatWarningCode = (typeof CHAT_WARNING_CODES)[number];

/** The turn kinds a lifecycle bus event reports. One home (no inline re-spell across the three members). */
export const TURN_INTENTS = ["send", "swipe", "continue", "generate", "impersonate"] as const;
export type TurnIntent = (typeof TURN_INTENTS)[number];

/** Why a turn aborted. */
export const TURN_ABORT_REASONS = ["user", "error", "stale"] as const;
export type TurnAbortReason = (typeof TURN_ABORT_REASONS)[number];

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
      source: ChatSource;
      model: string;
      /** The roster character speaking this turn (group "whose turn is it" automation; ST GROUP_MEMBER_DRAFTED).
       *  Null for a single-character chat or a non-character turn. */
      speakerCharacterId: CharacterId | null;
      /** For swipe/continue, the message this turn rerolls/extends (the ghost-slot id). Null otherwise. */
      targetMessageId: MessageId | null;
    }
  | { type: "turnCompleted"; chatId: ChatId; intent: TurnIntent; messageId: MessageId | null }
  | { type: "turnAborted"; chatId: ChatId; intent: TurnIntent; reason: TurnAbortReason }
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

/** The host-only per-room overrides — exactly four fields ("jailbreak" IS post_history). `.strict()`
 *  default-denies a stray key (an enforcer, not prose). Each field absent ⇒ inherit the card/scope
 *  fallback (resolved in SHAPE — INERT here). Stored in `chatMetadata` (an FK-clean JSON sub-blob). */
export const roomOverridesSchema = z
  .object({
    scenario: overrideField.optional(),
    mainPrompt: overrideField.optional(),
    postHistory: overrideField.optional(),
    authorsNote: overrideField.optional(),
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
export const MEMBER_CARD_VISIBILITY_LEVELS = [
  "name-avatar",
  "sheet",
  "sheet+lore",
  "full",
] as const;
export type MemberCardVisibility = (typeof MEMBER_CARD_VISIBILITY_LEVELS)[number];
export const memberCardVisibilitySchema = z.enum(MEMBER_CARD_VISIBILITY_LEVELS);

// ── Group config (the `chatMetadata.group` sub-blob) ──
/** Arbitration policy (WHO speaks each round). `@mention` is NOT a policy value — it is a hard override
 *  applied BEFORE the policy. `smart` (side-LLM) falls back to `natural` until wired. */
export const groupPolicySchema = z
  .enum(["natural", "list", "pooled", "manual", "smart"])
  .catch("natural")
  .default("natural");
export type GroupPolicy = z.infer<typeof groupPolicySchema>;

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
export const talkativenessSchema = z
  .number()
  .min(TALKATIVENESS_MIN)
  .max(TALKATIVENESS_MAX)
  .catch(TALKATIVENESS_DEFAULT)
  .default(TALKATIVENESS_DEFAULT);

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

/** The roster read-model (one `chat_participants` row, resolved for display). `kind` is the XOR
 *  discriminator (`userId` set for `human`, `characterId` for `character`); `talkativeness`/`disabled` feed
 *  arbitration + `{{groupNotMuted}}`; `leftSeq` null = present (the "present-and-contributing" predicate). */
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
  /** Resolved display name (persona/handle for a human, character name for an agent). */
  displayName: string;
  /** A human's public handle (null for an agent). */
  handle: Handle | null;
  /** The avatar asset (the floor — always member-visible via the D21 blob route's roster exception). */
  avatarAssetId: AssetId | null;
  /** The RESOLVED content-render policy for content THIS participant authored (D44 §12.0 — see
   *  {@link RenderPolicy}). ALWAYS server-populated on the `getChat`/roster read; declared OPTIONAL so a
   *  partial/legacy payload or a not-yet-migrated test literal fails CLOSED at the client (absent ⇒ the
   *  untrusted + gate-external safe floor), never fails open. */
  renderPolicy?: RenderPolicy;
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

// ── Group macros context (Part III §8 — data-fed, volatile) ──
/** The resolved roster + presence fed to the `{{group}}` family of macros (volatile — they must NOT sit in
 *  the cached static half). `castName` is the narrator turn-level `{{char}}` = the joined PRESENT cast,
 *  collapsing to the single name when the cast is 1 (so narrator-of-one == solo). `humans` backs the
 *  separate `{{party}}`/`{{humans}}` surface — humans are NOT in `{{group}}`/`{{notChar}}`. */
export interface GroupMacroContext {
  /** `{{group}}` — the FULL cast (a muted member still contributes; it just isn't a named active speaker). */
  group: string[];
  /** `{{groupNotMuted}}` — the present + active cast (drives arbitration the same way). */
  groupNotMuted: string[];
  /** `{{party}}`/`{{humans}}` — the present human cast. */
  humans: string[];
  /** The current speaker's name, to derive `{{notChar}}` (cast minus current speaker). Null off-turn. */
  currentSpeaker: string | null;
  /** `{{char}}`-as-cast — the comma-joined present cast (collapses to the single name when cast = 1). */
  castName: string;
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
    blocks.push({
      kind: "media",
      media: "image", // the D51 grammar embeds images; native a/v arrives via html-card/native paths
      src:
        span.ref.kind === "asset"
          ? // The span's assetId is a stored-canon ref parsed by the kit tokenizer (kit cannot carry
            // the brand — the cake); the schema-validated brand cast is the sanctioned re-entry.
            { kind: "asset", assetId: typeIdSchema(ID_PREFIX.asset).parse(span.ref.assetId) }
          : { kind: "external", url: span.ref.url },
      alt: span.alt,
    });
  }
  flushText();
  return blocks;
}
