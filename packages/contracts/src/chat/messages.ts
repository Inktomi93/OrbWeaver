// @orb/contracts/chat/messages — the D26 message/variant wire contract: `messages` is a pure SLOT
// (identity + attribution + selection ONLY), ALL content/economics live on `message_variants`, and
// `MessageView` is the slot joined with its SELECTED variant. Also the per-variant tool-call records (D48)
// and the runtime variable-delta wire (D46) parsed at the DB read seam. A swipe APPENDs a variant + flips a
// pointer (never a content copy); attribution is slot-level (a swipe never changes the voiced speaker).

import type { CharacterId, ChatId, MessageId, MessageVariantId, ModelId, PersonaId, UserConnectionId, UserId } from "@orb/kit/ids";
import { brandedId, ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { MacroFreeze, VarOp } from "@orb/kit/macro";
import type { MessageRole } from "@orb/kit/message-role";
import { z } from "zod";
import type { NormalizedFinishReason } from "../inference/finish-reasons.ts";
import type { ProviderId } from "../inference/provider-schema.ts";
import type { MessageKind } from "./participants.ts";
import { messageKindSchema, messageRoleSchema } from "./participants.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MESSAGE / VARIANT WIRE CONTRACT (D26) — `messages` is a pure SLOT; ALL content/economics live on
// `message_variants`. `MessageView` is the slot joined with its SELECTED variant.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

const SEQ_MIN = 0;

/** Variant-grain token accounting provenance. This is the one canonical vocabulary shared by provider
 * turns, imports, canon, rollups, and rendering: a number without this origin is not honest accounting. */
/** WHY a `message_assets` link exists (inference program §5.3b): `attached` = a user turn's upload;
 *  `illustration` = a narrator `/imagine` post (an ASSISTANT row with real `asset:` spans that must NOT ride
 *  back to the model); `inline-reply` = a picture the model itself emitted mid-turn (§6.7) — the ONLY origin
 *  the wire-history projection sends back as an assistant image part. `assets.kind` (`attachment` vs
 *  `generated`) cannot separate the last two; this per-LINK column is the reason it exists. NOT NULL, no
 *  default — every writer stamps it. */
export const MESSAGE_ASSET_ORIGINS = ["attached", "illustration", "inline-reply"] as const;
export type MessageAssetOrigin = (typeof MESSAGE_ASSET_ORIGINS)[number];

/** The ONE origin `substrate/wire-history` rides back to the model as an assistant image part (§6.7) —
 *  named because three sites must agree on it exactly: the commit that STAMPS it (the turn's inline-reply
 *  asset rows), the loader that reads the origin set, and the predicate that admits it. A fourth spelling of
 *  the literal is how a fence silently widens to every assistant-row asset. */
export const INLINE_REPLY_ORIGIN: MessageAssetOrigin = "inline-reply";

export const TOKEN_PROVENANCES = ["measured", "estimated", "unrecorded"] as const;
export type TokenProvenance = (typeof TOKEN_PROVENANCES)[number];
export const tokenProvenanceSchema = z.enum(TOKEN_PROVENANCES) satisfies z.ZodType<TokenProvenance>;

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

/** The PER-WIRE opaque provenance a `reasoning` part carries so the next leg of a tool loop — or a
 *  `carryReasoning: "conversation"` replay of a prior turn (§8.8) — can hand the model back its own verified
 *  thinking. CLOSED by wire, never an open bag: each arm is exactly what that provider's SDK reads off a
 *  replayed reasoning part, spelled in the provider's own vocabulary.
 *
 *  • `anthropic` — `signature` on a normal thinking block, `redactedData` on a redacted one
 *    (`@ai-sdk/anthropic` emits them on `reasoning-delta` / `reasoning-start` respectively and requires one
 *    of the two back, else it drops the block with a warning).
 *  • `openrouter` — the whole `reasoning_details` list verbatim. It is provider-shaped JSON (Anthropic
 *    signatures, Gemini thought signatures, OpenAI encrypted reasoning) that OUR layer never interprets: the
 *    OR provider re-validates it and strips entries whose signature is missing, so round-tripping the exact
 *    bytes is the whole contract. `JsonValue` (not `unknown`) keeps it serializable and re-parsable.
 *
 *  HOMED HERE, beside the variant DTO whose `reasoning_parts` column persists them, rather than in `bus.ts`
 *  where the content-part union lives: this module also owns {@link chatReasoningPartSchema}, the read seam
 *  for that column, and the import may only run bus → messages (bus already reads `MessageView`; the reverse
 *  is a cycle three gates refuse). `bus.ts` imports {@link ChatReasoningPart} as the `ChatContentPart`
 *  reasoning arm, so there is still exactly ONE spelling of the shape.
 *
 *  DELIBERATELY NOT ON `MessageView`: the parts are HOST-SIDE replay material, not a render surface, and a
 *  signature / encrypted-reasoning blob has no business crossing to a browser. The assembly reads them
 *  through the engine's own `loadReasoningParts` op instead (§8.8). */
export interface ReasoningPartMeta {
  readonly anthropic?: { readonly signature?: string | undefined; readonly redactedData?: string | undefined } | undefined;
  readonly openrouter?: { readonly reasoningDetails: readonly JsonValue[] } | undefined;
}

/** The model's own THINKING as one content part — the `reasoning` arm of `ChatContentPart` (which references
 *  this type rather than re-spelling it). Content, not display: the rendered reasoning a user reads is the
 *  variant's `reasoning` string. `text` may be EMPTY — a redacted thinking block is provenance only. */
export interface ChatReasoningPart {
  readonly type: "reasoning";
  readonly text: string;
  readonly meta?: ReasoningPartMeta | undefined;
}

/** The PARSE-ON-READ seam for `message_variants.reasoning_parts` (the `toolCalls` / `variableDelta` idiom — a
 *  malformed or absent blob degrades, never throws and never a drizzle `$type` cast). The provenance bodies
 *  stay `jsonValueSchema`-shaped: this layer re-serialises the provider's own bytes and never interprets
 *  them, so tightening them here would only invent a schema the provider does not owe us. */
export const chatReasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
  meta: z
    .object({
      anthropic: z.object({ signature: z.string().optional(), redactedData: z.string().optional() }).optional(),
      openrouter: z.object({ reasoningDetails: z.array(jsonValueSchema).transform((details): readonly JsonValue[] => details) }).optional(),
    })
    .optional(),
}) satisfies z.ZodType<ChatReasoningPart>;

/** THE ONE SPELLING of the `message_variants.metadata` key carrying a generation's REASONING TIME in ms.
 *
 *  The column was an OPEN blob (`Record<string, unknown>`) until §5.3c class 3 closed it onto
 *  {@link variantMetadataSchema}, so nothing bound its writers to its readers — the exact shape that let this
 *  key be READ by three sites while only the ST import ever WROTE it (#184; the same column already cost one
 *  nested-shape fidelity bug, `server/kit/serde/chat` §variantMetadata). The type is now the binding and this
 *  constant is the key's one spelling: the live turn's writer
 *  (`domain/chat/engine/engine.ts`) and the live stats mirror (`domain/chat/substrate/stats-delta.ts`) both
 *  spell it from here. DECLARED LIMIT: the two SQL readers in `domain/stats/write/rebuild-from-canon.ts`
 *  address it as a JSON PATH inside a `sql` template, where an interpolated value would bind as a
 *  PARAMETER rather than a path literal — those two sites cite this constant in a comment instead. */
export const VARIANT_METADATA_REASONING_MS_KEY = "reasoning_duration";

/** THE ONE SPELLING of the `message_variants.metadata` key carrying SillyTavern's `extra.token_count` — the
 *  count of the ROW'S OWN TEXT (not an API usage split), which only the ST import writes and only
 *  `domain/import`'s token-usage backfill reads (`substrate/token-usage.ts`
 *  `recordedTokenCountFromMetadata`). It is a DECLARED key of this sidecar rather than foreign residue for
 *  exactly that reason: it has a named live reader, so closing the column has to bind that reader too or the
 *  backfill silently degrades every `exactRecovered` row to `estimated`. §5.3c's table named only the
 *  reasoning window because it enumerated the LIVE-TURN writer; the tree has two keys with readers. */
export const VARIANT_METADATA_TOKEN_COUNT_KEY = "token_count";

/** The FIRST-PARTY arms of the per-provider sidecar: one NAMED shape per provider we ourselves write, keyed
 *  on a `provider` LITERAL so zod dispatches in one lookup and `tsc` narrows a reader to exactly one arm.
 *
 *  WHAT MAY LIVE IN AN ARM — the admission rule, because a sidecar with no rule becomes the open bag again
 *  wearing types: ONLY a fact the NORMALIZED core cannot carry (§5.3c's own sentence). A field whose value
 *  the same `message_variants` row already stores in a COLUMN is not provenance, it is a second home for one
 *  number, and the two drift. That rule retired three fields when the producing fold landed
 *  (`backends/kit/provider-metadata.ts`): OpenRouter's `cache` receipt (every V4 wire folds
 *  `prompt_tokens_details.cached_tokens` into `usage.inputTokens.cacheRead` → `cache_read_tokens`), its
 *  `upstreamGeneration` (that is `generation_id`, its own column), and the anthropic arm's
 *  `cacheReadTokens`/`cacheWriteTokens` (`cache_read_tokens`/`cache_write_tokens`). Anthropic's REAL
 *  unnormalizable fact is the ephemeral cache-creation TTL split, which is why its arm now carries the same
 *  two fields the subscription arm does — one vocabulary for one concept.
 *
 *  Every arm below has a live producer; an arm nobody writes is the "contract landed, wiring didn't" shape
 *  this sidecar exists to end. */
const namedProviderMetadataSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("openrouter"),
    /** WHICH UPSTREAM actually served the generation ("Anthropic", "DeepInfra", …) — OpenRouter's own
     *  `providerMetadata.openrouter.provider`. NOT our discriminator under another name: `provider` on this
     *  arm (and `message_variants.provider`) is the orbweaver REGISTRY id, always `openrouter` for a routed
     *  turn, so without this field the vendor that actually billed is unrecoverable from the record. */
    upstreamProvider: z.string().optional(),
    /** `usage.costDetails.upstreamInferenceCost` — what the upstream charged before OpenRouter's own fee. It
     *  reaches `cost_details.upstreamUsd` ONLY on a BYOK turn (where the split is the spend); on a
     *  passthrough turn the column records OR's total and this is the only record of the upstream figure. */
    upstreamCost: z.number().optional(),
  }),
  z.object({
    provider: z.literal("claude-sub"),
    /** The ephemeral cache-creation split by TTL (`usage.cache_creation.ephemeral_{5m,1h}_input_tokens`).
     *  `cache_write_tokens` is their SUM — the split itself has no normalized home. */
    cacheCreation5mTokens: z.number().optional(),
    cacheCreation1hTokens: z.number().optional(),
    /** Server-side web-search calls the SDK billed for this turn — dropped from `ChatUsage` by §5.3c
     *  precisely because it is Anthropic-shaped, and landed here instead of nowhere. */
    webSearchRequests: z.number().optional(),
    warmSpareClaimed: z.boolean().optional(),
    durationApiMs: z.number().optional(),
    numTurns: z.number().optional(),
    // @orb-waive no-raw-id(sdkSessionId): the Anthropic Agent SDK's OWN opaque session handle, echoed back verbatim as provenance — never an orbweaver-minted brand, and structurally never a TypeID (§5.3c class 4, the `toolCallId` precedent at line ~393). Kit's `SessionId` is `TypeIdOf<"session">`, the BFF session ROW id: a different vocabulary that happens to share the word. ENDS WHEN the SDK's handle stops being a foreign opaque string.
    sdkSessionId: z.string().optional(),
    servedModel: z.string().optional(),
  }),
  z.object({
    provider: z.literal("anthropic"),
    /** The same TTL split as the subscription arm, off `providerMetadata.anthropic.usage` (the RAW
     *  snake-cased Anthropic usage the SDK passes through as a loose object). */
    cacheCreation5mTokens: z.number().optional(),
    cacheCreation1hTokens: z.number().optional(),
  }),
]);

/** A PLUGIN provider's arm. Its `provider` is a PATTERN (`plugin:<namespace>/<id>`), not a literal — plugin
 *  ids are runtime data, so the set is unenumerable by construction. `raw` is `JsonValue` per §5.3c: storable
 *  and re-parsable, with NO reader by key (the `ReasoningPartMeta.openrouter.reasoningDetails` posture).
 *
 *  A TEMPLATE LITERAL, never `z.string().regex(…)`, and the difference is the union's whole promise: a bare
 *  `string` here ABSORBS every named arm's literal, so `meta.provider === "claude-sub"` narrowed to
 *  `claude-sub | plugin` and reading the subscription's own field off it did not compile. The inferred
 *  template type (`plugin:` + string) excludes the three named ids, so a reader narrows by the discriminator
 *  and lands on exactly one arm. The regex still runs — `templateLiteral` composes its parts' patterns, so
 *  `plugin:BAD`, `plugin:a/b/c` and a bare vendor name are all refused at the seam (probed 2026-09-20). */
const pluginProviderMetadataSchema = z.object({
  provider: z.templateLiteral(["plugin:", z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/u)]),
  raw: jsonValueSchema,
});

/** The per-provider OPAQUE-BY-DECLARATION sidecar a variant carries (§5.3c): a CLOSED union of NAMED shapes —
 *  a reader like the OpenRouter cost pill names a typed field or does not compile; a plugin provider's payload
 *  lands under `raw` with NO reader by key. Never `Record<ProviderId, unknown>` (the #164 open-bag class).
 *
 *  TWO LAYERS, and the split is load-bearing rather than stylistic: a `z.discriminatedUnion` REQUIRES every
 *  option's discriminator to expose enumerable literal values, and the plugin arm's cannot. Carrying it as a
 *  fourth option compiled and constructed fine and then THREW zod's "Invalid discriminated union option at
 *  index 3" on EVERY object input — including a valid openrouter arm — from inside zod's own option map,
 *  where `safeParse` does not contain it and neither does `.catch`. A throwing read seam is strictly
 *  worse than the open bag it replaced (it fails the history read that lists a chat), so the named arms keep
 *  their fast literal dispatch and the pattern arm is a plain union member beside them. Pinned by the
 *  `providerMetadata union is CLOSED by provider` case in tests/contracts/chat/messages.contract.test.ts. */
export const variantProviderMetadataSchema = z.union([namedProviderMetadataSchema, pluginProviderMetadataSchema]);
/** The parsed `providerMetadata` arm — what a typed reader (an OpenRouter cost pill, a cache-receipt badge)
 *  narrows on. A plugin provider's arm carries `raw` and NO reader by key. */
export type VariantProviderMetadata = z.infer<typeof variantProviderMetadataSchema>;

/** `message_variants.metadata` PARSED (never cast) at the read seam: the measured reasoning window under
 *  {@link VARIANT_METADATA_REASONING_MS_KEY}, the provider sidecar, and the ST import's foreign residue.
 *
 *  §5.3c CLASS 3 — a parsed JSON sidecar with a zod schema at the read seam and a producer-side parse on
 *  write, never `Record<string, unknown>` past the seam. The column's `$type` is this shape
 *  (`db/schema/chat.ts`), every reader goes through {@link parseVariantMetadata}, and every writer builds
 *  this object rather than a bag — which is what puts the SQL rollup readers'
 *  `json_extract(metadata, '$.reasoning_duration')` under `open-json-column-key-parity` at all (an open bag
 *  is one level BELOW that gate's reach: it judges the column's `$type`, never a bag inside it).
 *
 *  `importResidue` is the ST import's OWN doorway and the reason closing this type is not a data drop: an ST
 *  `swipe_info[i].extra` carries arbitrary foreign keys (`api`, `bias`, `send_date`, a tool's own residue)
 *  which the import preserved verbatim by flattening them into this column. They keep landing — under ONE
 *  named, `JsonValue`-typed field, which is §5.3c class 4: declared-OPAQUE provenance, never compared,
 *  switched on or joined, and unreadable by key without an explicit narrow. Flattening them back into the
 *  modeled level is what let a foreign file's `providerMetadata` key masquerade as ours. */
export const variantMetadataSchema = z.object({
  [VARIANT_METADATA_REASONING_MS_KEY]: z.number().optional(),
  [VARIANT_METADATA_TOKEN_COUNT_KEY]: z.number().optional(),
  providerMetadata: variantProviderMetadataSchema.optional(),
  importResidue: jsonValueSchema.optional(),
});
/** The parsed `message_variants.metadata` sidecar — the type the column's `$type` carries and every reader
 *  holds. Every field optional: an absent sidecar and a sidecar that recorded nothing are one value. */
export type VariantMetadata = z.infer<typeof variantMetadataSchema>;

/** The `{}` a degraded read yields — frozen so the `.catch` fallback can never be mutated by a caller into a
 *  shared stand-in that then looks like real recorded provenance. */
const EMPTY_VARIANT_METADATA: VariantMetadata = Object.freeze({});

/** THE READ SEAM for `message_variants.metadata` (§5.3c class 3 — the `macroFreezes`/`toolCalls`/
 *  `handoffOffer` idiom). A malformed, absent or foreign-shaped blob DEGRADES to `{}`; it never throws,
 *  because a history read must not fail on one old row whose shape nobody models, and it is never the
 *  drizzle `$type` cast — the annotation states the contract, this function proves it. */
export function parseVariantMetadata(raw: unknown): VariantMetadata {
  return variantMetadataSchema.catch(EMPTY_VARIANT_METADATA).parse(raw);
}

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

/** ONE model-emitted tool exchange, persisted on `message_variants.toolCalls` (D48).
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
 *  (the `parseChatMetadata` `.safeParse` pattern — never a cast). `satisfies z.ZodType<VarOp>` checks the
 *  schema-to-contract direction; the output-twin gate checks the reverse direction so neither may drift. */
export const varOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), key: z.string(), value: z.string() }),
  z.object({ op: z.literal("add"), key: z.string(), value: z.string() }),
  z.object({ op: z.literal("inc"), key: z.string() }),
  z.object({ op: z.literal("dec"), key: z.string() }),
  z.object({ op: z.literal("delete"), key: z.string() }),
]) satisfies z.ZodType<VarOp>;

/** The ordered per-variant delta (`message_variants.variable_delta`). Parsed at the read seam; folded along the
 *  selected-variant chain (`foldVarOps`) into `chats.runtime_variables` (D46 runtime plane). */
export type VariableDelta = readonly VarOp[];
export const variableDeltaSchema = z.array(varOpSchema).transform((ops): VariableDelta => ops) satisfies z.ZodType<VariableDelta>;

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
export type VariablePreconditions = readonly VariablePrecondition[];
export const variablePreconditionsSchema = z
  .array(variablePreconditionSchema)
  .transform((preconditions): VariablePreconditions => preconditions) satisfies z.ZodType<VariablePreconditions>;

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

/** One standalone (out-of-turn) delta batch (`chats.standalone_variable_deltas`) —
 *  a seq-stamped `applyVariableOps` write made with no turn in flight. Parsed at the read seam; folded into
 *  `chats.runtime_variables` interleaved with the message-variant deltas by `seq`. */
export const standaloneVariableDeltaSchema = z.object({ seq: z.number(), delta: variableDeltaSchema });
export type StandaloneVariableDelta = z.infer<typeof standaloneVariableDeltaSchema>;
export type StandaloneVariableDeltas = StandaloneVariableDelta[];
export const standaloneVariableDeltasSchema = z.array(standaloneVariableDeltaSchema) satisfies z.ZodType<StandaloneVariableDeltas>;

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
 *  wrote it. `satisfies z.ZodType<MacroFreeze>` checks the schema-to-contract direction, and the output-twin
 *  gate checks the reverse direction against the kit {@link MacroFreeze} the macro engine EMITS. */
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
  // @orb-waive no-raw-id(toolCallId): PROVIDER-emitted opaque tool-call handle (OpenAI `call_…`/Anthropic id) — never an orbweaver-minted brand; provenance-faithful, joins a tool-call to its result on the wire (D48 types it `string`).
  toolCallId: z.string(),
  name: z.string(),
  /** RAW model-emitted JSON string (provenance-faithful; parsed once, at execute). */
  arguments: z.string(),
  /** JSON document serialized by execute; `null` = not executed (recurse-limit — D48). */
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
  model: ModelId | null;
  provider: ProviderId | null;
  /** The NORMALIZED reason (`NORMALIZED_FINISH_REASONS`); `stopReason`/`terminalReason` are the raw upstream
   *  words, OPAQUE provenance never compared or switched on (inference program §5.3c class 4). */
  finishReason: NormalizedFinishReason | null;
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
  /** WHERE `costUsd` came from — the SAME tuple as {@link tokenProvenance} (§5.3c never mints a second
   *  accounting vocabulary). `measured` = the wire reported a figure, `estimated` = catalog/declared pricing
   *  × normalized tokens, `unrecorded` = neither. The cost pill needs it to say whether its number is a
   *  receipt or an estimate, and the commit-time view has always carried it — this is the read half. */
  costProvenance: TokenProvenance;
  ttftMs: number | null;
  /** Generation-window bounds (epoch-ms) for this swipe — the wall time the turn engine began/finished
   *  the model call. Both null on a non-generated row (user/system/draft-greeting). `gf − gs` (when both
   *  present and ordered) is the generation duration the `showGenerationTimer` chip reads (PD-130). */
  genStartedAt: number | null;
  genFinishedAt: number | null;
  /** The upstream generation handle (OpenRouter's `gen-…`) this shown swipe billed under — the key a quiet
   *  per-message cost readout settles with via `connection.generationCost` (PD-137), resolved against
   *  `connectionId`. Null where the transport reports none (agent-sdk / endpoint rows / user/system rows). */
  generationId: string | null;
  /** WHICH of the funder's connection rows generated this swipe (inference program §5.3b) — SET NULL after the
   *  row is deleted, so attribution outlives the connection. Null on user-authored rows, imports and edits. */
  connectionId: UserConnectionId | null;
  /** The selected variant's persisted tool exchanges (D48), in emission/execution
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
  z.object({ kind: z.literal("messages"), messageIds: z.array(typeIdSchema(ID_PREFIX.message)) }),
  z.object({ kind: z.literal("mine"), fromSeq: z.number().int().min(SEQ_MIN).optional() }),
]);

export type ReattributeScope = z.infer<typeof reattributeScopeSchema>;

// The STATE-ANCHOR selectors (`isStateAnchorSlot` / `lastVisibleRow` / `lastVisibleAssistant`) are GONE
// (D124). They existed because rpg minted empty-body assistant slots to key hand-written snapshots, so
// "the tail" and "the last assistant" had to mean "skipping the rows that are not messages". Those rows no
// longer exist — a hand-written snapshot is a message-less `rpg_snapshots` row — so every consumer is back
// to a plain `findLast`, and the regression class the seam guarded died with the rows.
