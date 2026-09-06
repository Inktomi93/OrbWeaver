// @orb/contracts/chat/messages — the D26 message/variant wire contract: `messages` is a pure SLOT
// (identity + attribution + selection ONLY), ALL content/economics live on `message_variants`, and
// `MessageView` is the slot joined with its SELECTED variant. Also the per-variant tool-call records (D48)
// and the runtime variable-delta wire (D46) parsed at the DB read seam. A swipe APPENDs a variant + flips a
// pointer (never a content copy); attribution is slot-level (a swipe never changes the voiced speaker).

import type { CharacterId, ChatId, MessageId, MessageVariantId, PersonaId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { MacroFreeze, VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { z } from "zod";
import type { MessageKind } from "./participants.ts";
import { messageKindSchema, messageRoleSchema } from "./participants.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MESSAGE / VARIANT WIRE CONTRACT (D26) — `messages` is a pure SLOT; ALL content/economics live on
// `message_variants`. `MessageView` is the slot joined with its SELECTED variant.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

const SEQ_MIN = 0;

/** Variant-grain token accounting provenance. This is the one canonical vocabulary shared by provider
 * turns, imports, canon, rollups, and rendering: a number without this origin is not honest accounting. */
export const TOKEN_PROVENANCES = ["measured", "estimated", "unrecorded"] as const;
export type TokenProvenance = (typeof TOKEN_PROVENANCES)[number];
export const tokenProvenanceSchema = z.enum(TOKEN_PROVENANCES);

/** Combine accounting origins for a displayed total. One estimate makes the sum approximate; measured
 *  wins only over absence. Keeping this beside the vocabulary prevents cross-domain rollups from inventing
 *  different precedence rules. */
export function combineTokenProvenance(left: TokenProvenance, right: TokenProvenance): TokenProvenance {
  if (left === "estimated" || right === "estimated") {
    return "estimated";
  }
  return left === "measured" || right === "measured" ? "measured" : "unrecorded";
}

/** The `listMessages` page CEILING, enforced at the transport trust boundary (the `CHAT_LIST_MAX_LIMIT` /
 *  `character.list` precedent). An unclamped `limit` is an unbounded SQL `.limit()` DoS surface; an over-bound
 *  ask is refused as BAD_REQUEST. The same 100 the domain DoS backstop (`read.ts` `Math.min`, for internal
 *  callers) references, homed HERE so the wire ceiling and the backstop never drift. */
export const CHAT_MESSAGE_LIST_MAX_LIMIT = 100;

/** THE ONE SPELLING of the `message_variants.metadata` key carrying a generation's REASONING TIME in ms.
 *
 *  The column is an OPEN blob (`Record<string, unknown>`), so no type binds its writers to its readers — the
 *  exact shape that let this key be READ by three sites while only the ST import ever WROTE it (#184; the
 *  same column already cost one nested-shape fidelity bug, `server/kit/serde/chat` §variantMetadata). One
 *  home for the string is the cheapest binding available: the live turn's writer
 *  (`domain/chat/engine/engine.ts`) and the live stats mirror (`domain/chat/substrate/stats-delta.ts`) both
 *  spell it from here. DECLARED LIMIT: the two SQL readers in `domain/stats/write/rebuild-from-canon.ts`
 *  address it as a JSON PATH inside a `sql` template, where an interpolated value would bind as a
 *  PARAMETER rather than a path literal — those two sites cite this constant in a comment instead. */
export const VARIANT_METADATA_REASONING_MS_KEY = "reasoning_duration";

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
  /** WHAT SORT OF ROW this is, DECLARED at mint ({@link messageKindSchema} — the axis + its policy live in
   *  `participants.ts`). Orthogonal to `role` (the conversation plane) and to attribution (the voice): a
   *  narrator row is `kind:'narrator'` AND `role:'assistant'`, and stays narrator after an identity delete
   *  SET-NULLs its attribution or the room's output dial flips. Born `standard` unless a writer declares. */
  kind: messageKindSchema,
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

/** ONE write-time precondition on a runtime-variable write (#1555): "I believe `key` currently reads
 *  `expected`" — `null` meaning "I believe the key is UNSET". The writer applies its ops only if EVERY
 *  precondition still holds against the fold it is writing over; otherwise nothing is written and the caller
 *  is told what the value actually is.
 *
 *  DELIBERATELY NOT A MEMBER OF {@link VarOp}, and that is the load-bearing decision. A `VarOp` is a DURABLE,
 *  REPLAYED record: it is persisted in `message_variants.variable_delta` / `chats.standalone_variable_deltas`
 *  and re-folded from scratch on every swipe, fork and mutator refold. A precondition is a fact about ONE
 *  moment at the write door — replaying it later would either be silently ignored (making the stored op a lie)
 *  or re-evaluated against a different chain (making the fold non-deterministic, which is the exact property
 *  D46's derive-don't-stamp model exists to guarantee). So the precondition rides the CALL and never the LOG.
 *
 *  It is also NOT a version counter, on purpose: a counter is blind to a writer that does not bump it, and
 *  this plane's writers (an automation arm, the analysis arm, the plugin membrane, a `{{setvar}}` turn) do not
 *  share one. Comparing the VALUE is the same idiom `applyProseRewrite`'s `expectedContentHash` uses. */
export interface VariablePrecondition {
  readonly key: string;
  readonly expected: string | null;
}
export const variablePreconditionSchema = z.object({ key: z.string(), expected: z.string().nullable() }) satisfies z.ZodType<VariablePrecondition>;
export const variablePreconditionsSchema = z.array(variablePreconditionSchema);

/** What a runtime-variable write answers (#1555). `applied` = the ops landed. `stale` = at least one
 *  {@link VariablePrecondition} did not hold, NOTHING was written, and `actual` carries the live value of every
 *  precondition key (`null` = unset) so the caller can re-derive and retry without a second read — which would
 *  reopen the very window the precondition closed.
 *
 *  A REFUSAL IS DATA, NEVER A THROW. This value crosses the plugin membrane, where three uncaught crashes
 *  auto-disable a plugin (`domain/plugin/activation/crash-policy.ts`): losing a race is the NORMAL outcome of a
 *  contended write and must not spend a crash strike. An unconditional write (no preconditions) can only ever
 *  answer `applied`. */
export type VariableWriteResult = { readonly outcome: "applied" } | { readonly outcome: "stale"; readonly actual: Record<string, string | null> };
export const variableWriteResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("applied") }),
  z.object({ outcome: z.literal("stale"), actual: z.record(z.string(), z.string().nullable()) }),
]) satisfies z.ZodType<VariableWriteResult>;

/** One standalone (out-of-turn) delta batch (`chats.standalone_variable_deltas`) —
 *  a seq-stamped `applyVariableOps` write made with no turn in flight. Parsed at the read seam; folded into
 *  `chats.runtime_variables` interleaved with the message-variant deltas by `seq`. */
export const standaloneVariableDeltaSchema = z.object({ seq: z.number(), delta: variableDeltaSchema });
export const standaloneVariableDeltasSchema = z.array(standaloneVariableDeltaSchema);
export type StandaloneVariableDelta = z.infer<typeof standaloneVariableDeltaSchema>;

/** The per-turn user-macro random-pick draw record (WAVE MU delivery) — the read-parse boundary for
 *  `message_variants.macro_draws`: macro name → input name → the drawn option value (a bare string per
 *  input). Written at turn commit (the frozen ∪ fresh effective record) in the SAME atomic batch as the
 *  variant; the swipe/continue path replays it as kit's `frozenDraws` so a re-generation of the same slot
 *  resolves the IDENTICAL draw (freeze-at-commit determinism — the `{{roll}}` class). Absent/null ⇒ this
 *  turn drew nothing (no random-pick user macro, or none authored). Parsed at the read seam
 *  (`loadSlotTarget` / the variant read), never cast — a malformed blob degrades to `null`. */
export const userMacroDrawsSchema = z.record(z.string(), z.record(z.string(), z.string()));
export type UserMacroDraws = z.infer<typeof userMacroDrawsSchema>;

/** ONE volatile-macro occurrence frozen into a stored body — the read-parse boundary for
 *  `message_variants.macro_freezes`. `name` is the REGISTERED macro name (`roll`/`random`/`pick`/the clock
 *  family), `args` its delivered argument text when it took one (`{{roll::2d6}}` ⇒ `"2d6"`), `value` the
 *  string the freeze substituted. Occurrence-ordered, so a replay walks it positionally exactly as the freeze
 *  wrote it. `satisfies z.ZodType<MacroFreeze>` keeps this schema pinned to the kit {@link MacroFreeze} the
 *  macro engine EMITS — change the kit shape and this stops compiling (the {@link varOpSchema} arrangement). */
export const macroFreezeSchema = z.object({
  name: z.string(),
  args: z.string().optional(),
  value: z.string(),
}) satisfies z.ZodType<MacroFreeze>;

/** The per-variant VOLATILE-FREEZE record (stickler 2026-08-08 §3 — the `macroDraws` idiom generalized).
 *
 *  WHY IT EXISTS: a `{{roll}}`/`{{random}}`/clock macro FREEZES at commit — destructively baked into the
 *  stored text (D51's one-post-transform-text rule) — and until this column it left NO record and NO
 *  pre-freeze raw. So a swipe could never replay the roll, a re-attribution could never re-resolve the row,
 *  and the documented greeting-swipe gap (a post-first-turn swipe to a never-frozen greeting variant) was
 *  structurally unfixable. With `rawContent` + this record, every nondeterministic input to a variant's turn
 *  is recorded per-variant (draws ∪ freezes ∪ params ∪ promptSnapshot): running the volatile registry over
 *  the raw with these as frozen values reproduces `content`'s macro spans byte-exactly, and running it with
 *  FRESH values is an intentional re-roll rather than data loss.
 *
 *  Absent/null ⇒ nothing froze (the common case). Parsed at the read seam, never cast — a malformed blob
 *  degrades to null (the `parseChatMetadata` pattern). HOST-PLANE: it is served only on the host-gated
 *  variant wire view beside `rawContent`, never on `MessageView`. */
export const macroFreezeRecordSchema = z.array(macroFreezeSchema);
export type MacroFreezeRecord = z.infer<typeof macroFreezeRecordSchema>;

export const toolCallRecordSchema = z.object({
  // @orb-waive no-raw-id(toolCallId): PROVIDER-emitted opaque tool-call handle (OpenAI `call_…`/Anthropic id) — never an orbweaver-minted brand; provenance-faithful, joins a tool-call to its result on the wire (tool-use-design/03 §3 types it `string`).
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
  /** The row's declared PURPOSE (see {@link messageSlotSchema}). Member-visible and safe — it is chrome
   *  vocabulary, not content: the client renders narrator tint / speaker splitting / OOC treatment off THIS
   *  field instead of re-deriving purpose from attribution + the room's current output mode. */
  kind: MessageKind;
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
  /** The SELECTED variant carries a continue snapshot (`preContinue*` + `lastContinuation*` both set, D26)
   *  — i.e. a guided/plain continue has run on this swipe, so `chat.undoContinue`/`revertContinue` have
   *  something to restore. Per-swipe (the columns live on `message_variants`); stays true after an undo (the
   *  snapshot is retained so revert can re-apply). Powers the ⋯ menu's undo/revert phase-gate — false ⇒ the
   *  items disable with the "continue this reply first" reason, never hidden. */
  hasContinuation: boolean;
  content: string;
  reasoning: string | null;
  model: string | null;
  provider: string | null;
  finishReason: string | null;
  stopReason: string | null;
  terminalReason: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  /** Origin of the selected variant's token columns. `unrecorded` means both columns are absent. */
  tokenProvenance: TokenProvenance;
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

// ── the `reattributePersona` SCOPE (the ONE stamp writer's two arms) ────────────────────────────────────
// Chat-Macro-Resolution §5: re-stamping `messages.personaId` is the ONLY persona repair a history ever
// needs, because every renderable surface (display + the assembled prompt) resolves the NAME live off the
// stamp. `messages` is the explicit slot set (a per-row correction). `mine` is SERVER-resolved — every
// user-role slot in the chat the CALLER authored, optionally floored at `fromSeq` — and exists because a
// client cannot enumerate what it cannot page: the panel's affordance used to assemble ids from the last
// 100 messages, so a wrong-persona stretch older than that was unreachable (FINAL-Persona §A.7 named the
// limitation and pre-authorized this arm). `mine` is a SELF-stamp: the rows it resolves are the caller's
// own, so it widens reach, never authority (the verb's author-or-host belt is unchanged).
export const reattributeScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("messages"), messageIds: z.array(brandedId<MessageId>()) }),
  z.object({ kind: z.literal("mine"), fromSeq: z.number().int().min(SEQ_MIN).optional() }),
]);

export type ReattributeScope = z.infer<typeof reattributeScopeSchema>;

// The STATE-ANCHOR selectors (`isStateAnchorSlot` / `lastVisibleRow` / `lastVisibleAssistant`) are GONE
// (D124). They existed because rpg minted empty-body assistant slots to key hand-written snapshots, so
// "the tail" and "the last assistant" had to mean "skipping the rows that are not messages". Those rows no
// longer exist — a hand-written snapshot is a message-less `rpg_snapshots` row — so every consumer is back
// to a plain `findLast`, and the regression class the seam guarded died with the rows.
