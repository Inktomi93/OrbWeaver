// @orb/contracts/chat/messages — the D26 message/variant wire contract: `messages` is a pure SLOT
// (identity + attribution + selection ONLY), ALL content/economics live on `message_variants`, and
// `MessageView` is the slot joined with its SELECTED variant. Also the per-variant tool-call records (D48)
// and the runtime variable-delta wire (D46) parsed at the DB read seam. A swipe APPENDs a variant + flips a
// pointer (never a content copy); attribution is slot-level (a swipe never changes the voiced speaker).

import type { CharacterId, ChatId, MessageId, MessageVariantId, PersonaId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { z } from "zod";
import type { UserIntent } from "#preset";
import type { AssembledPrompt } from "./assemble";
import { messageRoleSchema } from "./participants";

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

/** The per-turn user-macro random-pick draw record (WAVE MU delivery) — the read-parse boundary for
 *  `message_variants.macro_draws`: macro name → input name → the drawn option value (a bare string per
 *  input). Written at turn commit (the frozen ∪ fresh effective record) in the SAME atomic batch as the
 *  variant; the swipe/continue path replays it as kit's `frozenDraws` so a re-generation of the same slot
 *  resolves the IDENTICAL draw (freeze-at-commit determinism — the `{{roll}}` class). Absent/null ⇒ this
 *  turn drew nothing (no random-pick user macro, or none authored). Parsed at the read seam
 *  (`loadSlotTarget` / the variant read), never cast — a malformed blob degrades to `null`. */
export const userMacroDrawsSchema = z.record(z.string(), z.record(z.string(), z.string()));
export type UserMacroDraws = z.infer<typeof userMacroDrawsSchema>;

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
// STATE-ANCHOR SLOTS — the canon rows that are NOT messages
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// An rpg STATE-ANCHOR is an EMPTY-body assistant slot minted only to KEY a snapshot: the between-turns
// hand-edit (`editSnapshot`) and the host `resyncFromStory` clone-forward both post
// `postNarratorMessage(chatId, "")` and write the rebuilt state onto that slot's variant. It is a durable
// canon row that no reader ever sees and no actor may target.
//
// Empty content is the precise, sufficient discriminator — no server flag needed: a real generation always
// carries content, a user draft never commits blank, and the slot deliberately stays
// `excludedFromPrompt=false` so the rpg snapshot-resolution ladder (which keys on that flag) still resolves
// it as head. The wire prompt already drops it (the shape stage's empty-row filter / `squashSameRole`).
//
// These selectors are the ONE home for "which canon row does a reader/actor mean". Every consumer that asks
// for "the tail" or "the last assistant" MUST go through them: an anchor answering that question is how a
// swipe/continue/rewrite ends up targeting an invisible slot (appending a prose variant onto the snapshot's
// own message and moving the ladder head), and how the last VISIBLE reply loses its swipe controls.
// Consumed by both the client surfaces and server assembly.

/** An rpg state-anchor slot: an empty-body canon row that KEYS a snapshot rather than carrying a message. */
export function isStateAnchorSlot(view: Pick<MessageView, "content">): boolean {
  return view.content.trim() === "";
}

/** The newest canon row a reader actually sees — the tail, skipping state anchors. `undefined` on an empty
 *  (or anchors-only) transcript. The target resolver for every tail-addressed action. */
export function lastVisibleRow(rows: readonly MessageView[]): MessageView | undefined {
  return rows.findLast((row) => !isStateAnchorSlot(row));
}

/** The newest REAL assistant generation — the last assistant row that is not a state anchor. `undefined`
 *  when none. An anchor is not a generation, so its (never-stamped) per-turn fields must never answer
 *  "what did the last generation do". */
export function lastVisibleAssistant(rows: readonly MessageView[]): MessageView | undefined {
  return rows.findLast((row) => row.role === "assistant" && !isStateAnchorSlot(row));
}
