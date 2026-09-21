import type { MessageSlot, MessageView, UserMacroDraws } from "@orb/contracts/chat";
import {
  combineTokenProvenance,
  macroFreezeRecordSchema,
  messageSlotSchema,
  parseVariantMetadata,
  reattributeScopeSchema,
  TOKEN_PROVENANCES,
  tokenProvenanceSchema,
  toolCallRecordSchema,
  userMacroDrawsSchema,
  VARIANT_METADATA_REASONING_MS_KEY,
  VARIANT_METADATA_TOKEN_COUNT_KEY,
  variantMetadataSchema,
} from "@orb/contracts/chat";
import type { UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

// ── Sample ids (minted/cast — no pasted random-looking literals; noSecrets) ───
const SAMPLE_MESSAGE_ID = mintTypeId(ID_PREFIX.message);
const SAMPLE_CHAT_ID = mintTypeId(ID_PREFIX.chat);
const SAMPLE_VARIANT_ID = mintTypeId(ID_PREFIX.messageVariant);
const SAMPLE_CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const SAMPLE_PERSONA_ID = mintTypeId(ID_PREFIX.persona);
const SAMPLE_USER_ID = castId<UserId>("user-alice");

test("token provenance has exactly one canonical three-member vocabulary", () => {
  expect(TOKEN_PROVENANCES).toEqual(["measured", "estimated", "unrecorded"]);
  expect(tokenProvenanceSchema.options).toEqual([...TOKEN_PROVENANCES]);
  expect(tokenProvenanceSchema.safeParse("inferred").success).toBe(false);
});

test("token provenance combination makes estimates dominant and absence neutral", () => {
  expect(combineTokenProvenance("measured", "estimated")).toBe("estimated");
  expect(combineTokenProvenance("unrecorded", "measured")).toBe("measured");
  expect(combineTokenProvenance("unrecorded", "unrecorded")).toBe("unrecorded");
});

// ═══ D26 — the message SLOT carries NO content; content lives on the variant ════

test("messageSlotSchema round-trips a valid slot", () => {
  const slot: MessageSlot = {
    id: SAMPLE_MESSAGE_ID,
    chatId: SAMPLE_CHAT_ID,
    seq: 4,
    role: "assistant",
    kind: "standard",
    authorUserId: null,
    characterId: SAMPLE_CHARACTER_ID,
    personaId: null,
    selectedVariantId: SAMPLE_VARIANT_ID,
    excludedFromPrompt: false,
    createdAt: 1,
    editedAt: null,
  };
  expect(messageSlotSchema.parse(slot)).toEqual(slot);
});

test("a content field is STRIPPED from the slot at the boundary (D26 — slot has no content)", () => {
  const slotWithContent = {
    id: SAMPLE_MESSAGE_ID,
    chatId: SAMPLE_CHAT_ID,
    seq: 0,
    role: "user" as const,
    kind: "standard" as const,
    authorUserId: SAMPLE_USER_ID,
    characterId: null,
    personaId: SAMPLE_PERSONA_ID,
    selectedVariantId: SAMPLE_VARIANT_ID,
    excludedFromPrompt: false,
    createdAt: 1,
    editedAt: null,
    // The D26 violation — a generation's text on the slot. The plain z.object strips it.
    content: "this must not survive on the slot",
    reasoning: "neither must this",
  };
  const parsed = messageSlotSchema.parse(slotWithContent);
  expect("content" in parsed).toBe(false);
  expect("reasoning" in parsed).toBe(false);
});

// SECRET-STRIP BACKSTOP (bus-payload-allowlist, mirrors the notifications strip test). `ChatBusEvent` is a
// schema-less TS union (validated only via `isChatBusEventType`, never zod-parsed — its secret-free shape is
// pinned at the type level in `index.test-d.ts`). `messageSlotSchema` is the canonical chat payload that DOES
// cross a zod boundary: it is a plain `z.object` (NOT `.loose()`), so an injected secret-bearing field is
// STRIPPED at parse — it can never ride into the durable row or the stream. If someone loosens it, this goes
// red. The values are obvious non-secret literals (noSecrets); the field NAMES are what an exfil would use.
test("an injected secret field is stripped from a chat payload at the schema boundary", () => {
  const slotWithSecret = {
    id: SAMPLE_MESSAGE_ID,
    chatId: SAMPLE_CHAT_ID,
    seq: 1,
    role: "assistant" as const,
    kind: "standard" as const,
    authorUserId: null,
    characterId: SAMPLE_CHARACTER_ID,
    personaId: null,
    selectedVariantId: SAMPLE_VARIANT_ID,
    excludedFromPrompt: false,
    createdAt: 1,
    editedAt: null,
    apiKey: "injected-extra-field",
    token: "injected-extra-field",
  };
  const parsed = messageSlotSchema.parse(slotWithSecret);
  expect("apiKey" in parsed).toBe(false);
  expect("token" in parsed).toBe(false);
});

test("MessageView is the slot joined with its selected variant (content + economics present)", () => {
  const view: MessageView = {
    id: SAMPLE_MESSAGE_ID,
    chatId: SAMPLE_CHAT_ID,
    seq: 2,
    role: "assistant",
    kind: "standard",
    authorUserId: null,
    characterId: SAMPLE_CHARACTER_ID,
    personaId: null,
    excludedFromPrompt: false,
    createdAt: 1,
    editedAt: null,
    selectedVariantId: SAMPLE_VARIANT_ID,
    selectedVariantIdx: 0,
    variantCount: 1,
    hasContinuation: false,
    content: "hello there",
    reasoning: null,
    model: "claude-sonnet",
    provider: "openrouter",
    finishReason: "stop",
    stopReason: null,
    terminalReason: null,
    tokensIn: 10,
    tokensOut: 20,
    tokenProvenance: "measured",
    costProvenance: "unrecorded",
    cacheReadTokens: null,
    cacheWriteTokens: null,
    contextWindow: 200_000,
    costUsd: null,
    ttftMs: 120,
    genStartedAt: 1000,
    genFinishedAt: 4400,
    generationId: null,
    connectionId: null,
    contextBoundaryMessageId: null,
    toolCalls: [],
  };
  expect(view.content).toBe("hello there");
  expect(view.selectedVariantId).toBe(SAMPLE_VARIANT_ID);
});

// ── toolCallRecordSchema (D48/PD-54 T1) — the db read-seam parse for `message_variants.toolCalls` ────
test("toolCallRecordSchema round-trips an executed record AND the recorded-unexecuted shape", () => {
  const executed = {
    toolCallId: "call_abc123",
    name: "tick_clock",
    arguments: '{"minutes":30}',
    result: '{"advanced":true}',
    isError: false,
    durationMs: 12,
  };
  expect(toolCallRecordSchema.parse(executed)).toEqual(executed);

  // Recurse-limit hit: recorded-but-unexecuted ⇔ result:null + durationMs:null (03 §2.2).
  const unexecuted = { ...executed, result: null, durationMs: null };
  expect(toolCallRecordSchema.parse(unexecuted)).toEqual(unexecuted);

  // isError is authoritative for chip styling — an error result is still a JSON document string.
  const errored = { ...executed, result: '{"error":"party is mid-combat"}', isError: true };
  expect(toolCallRecordSchema.parse(errored)).toEqual(errored);
});

test("toolCallRecordSchema refuses a structurally wrong record (no cast-shaped reads)", () => {
  // `arguments` must stay the RAW string — a pre-parsed object is the exact drift the schema exists to catch.
  expect(
    toolCallRecordSchema.safeParse({
      toolCallId: "call_x",
      name: "n",
      arguments: { minutes: 30 },
      result: null,
      isError: false,
      durationMs: null,
    }).success,
  ).toBe(false);
});

// ── userMacroDrawsSchema (WAVE MU delivery) — the db read-seam parse for `message_variants.macro_draws` ──
test("userMacroDrawsSchema round-trips the nested macro→input→drawn-value record", () => {
  const draws: UserMacroDraws = {
    mood: { tone: "grim" },
    weather: { pick: "storm", secondary: "cold" },
  };
  expect(userMacroDrawsSchema.parse(draws)).toEqual(draws);
  // An empty record (a turn that drew nothing but recorded the shape) is valid.
  expect(userMacroDrawsSchema.parse({})).toEqual({});
});

// ── reattributeScopeSchema — the `reattributePersona` row-selection axis (stickler Q3 / FINAL-Persona §A.7) ──
// The bulk arm is the one that carries risk: it names NO rows, so the shape must make "restamp mine" and
// "restamp these" impossible to confuse, and must not let a stray `messageIds` ride the bulk arm into the verb.

test("reattributeScopeSchema discriminates the explicit id set from the server-resolved mine arm", () => {
  const explicit = { kind: "messages" as const, messageIds: [SAMPLE_MESSAGE_ID] };
  expect(reattributeScopeSchema.parse(explicit)).toEqual(explicit);
  expect(reattributeScopeSchema.parse({ kind: "mine" })).toEqual({ kind: "mine" });
  // `fromSeq` is the advanced floor — an integer seq, optional, never negative.
  expect(reattributeScopeSchema.parse({ kind: "mine", fromSeq: 12 })).toEqual({ kind: "mine", fromSeq: 12 });
  expect(reattributeScopeSchema.safeParse({ kind: "mine", fromSeq: -1 }).success).toBe(false);
  expect(reattributeScopeSchema.safeParse({ kind: "mine", fromSeq: 1.5 }).success).toBe(false);
  // The explicit arm cannot omit its ids, and no third arm exists.
  expect(reattributeScopeSchema.safeParse({ kind: "messages" }).success).toBe(false);
  expect(reattributeScopeSchema.safeParse({ kind: "everyone" }).success).toBe(false);
});

test("the mine arm STRIPS a smuggled messageIds — a bulk restamp can never carry a foreign row list", () => {
  expect(reattributeScopeSchema.parse({ kind: "mine", messageIds: [SAMPLE_MESSAGE_ID] })).toEqual({ kind: "mine" });
});

test("reattribution message ids reject malformed and wrong-prefix TypeIDs", () => {
  expect(reattributeScopeSchema.safeParse({ kind: "messages", messageIds: [SAMPLE_MESSAGE_ID] }).success).toBe(true);
  expect(reattributeScopeSchema.safeParse({ kind: "messages", messageIds: [SAMPLE_CHAT_ID] }).success).toBe(false);
  expect(reattributeScopeSchema.safeParse({ kind: "messages", messageIds: ["message_not-a-typeid"] }).success).toBe(false);
});

// ── macroFreezeRecordSchema — the read-seam parse for `message_variants.macro_freezes` (stickler §3) ──
// The volatile freeze ({{roll}}/{{random}}/{{pick}}/the clock family) is byte-DESTRUCTIVE: it bakes drawn
// values into the stored text. Until this record it left no trace, so a swipe could not replay a roll and the
// documented greeting-swipe gap was unfixable. The record is what makes a variant's macro spans re-derivable.

test("macroFreezeRecordSchema round-trips ordered occurrences; `args` is optional; order is preserved", () => {
  const record = [
    { name: "roll", args: "2d6", value: "9" },
    { name: "time", value: "14:03:22" },
    { name: "roll", args: "2d6", value: "4" },
  ];
  const parsed = macroFreezeRecordSchema.parse(record);
  expect(parsed).toEqual(record);
  // Two occurrences of the SAME macro are two ENTRIES, never a dedup: a replay walks the list positionally,
  // so collapsing them would re-substitute the first roll's value into the second span.
  expect(parsed.map((f) => f.value)).toEqual(["9", "14:03:22", "4"]);
  // Nothing froze ⇒ the empty record (the column is NULL in that case; both mean the same to a reader).
  expect(macroFreezeRecordSchema.parse([])).toEqual([]);
});

test("macroFreezeRecordSchema refuses a non-string frozen value (the record holds the SUBSTITUTED text)", () => {
  // `value` is what the freeze actually wrote into the body — always the substituted string, never a numeric
  // or structured pre-render form, because a replay re-substitutes those exact bytes.
  expect(macroFreezeRecordSchema.safeParse([{ name: "roll", value: 9 }]).success).toBe(false);
  expect(macroFreezeRecordSchema.safeParse([{ name: "roll", args: 6, value: "9" }]).success).toBe(false);
  // An entry with no macro NAME cannot be replayed against anything.
  expect(macroFreezeRecordSchema.safeParse([{ value: "9" }]).success).toBe(false);
  // The blob is an ordered LIST, not the keyed map `macroDraws` uses — position IS the key here.
  expect(macroFreezeRecordSchema.safeParse({ roll: "9" }).success).toBe(false);
});

test("userMacroDrawsSchema refuses a non-string leaf (the draw is always the DRAWN string, never a pool/bool)", () => {
  // A random-pick POOL (string[]) is the INPUT VALUE, not the DRAW — the draw is the single chosen option.
  expect(userMacroDrawsSchema.safeParse({ mood: { tone: ["a", "b"] } }).success).toBe(false);
  expect(userMacroDrawsSchema.safeParse({ mood: { tone: true } }).success).toBe(false);
  // A flat (one-level) record is the wrong depth — every value must be an input→string sub-record.
  expect(userMacroDrawsSchema.safeParse({ mood: "grim" }).success).toBe(false);
});

// ── message_variants.metadata: the §5.3c class-3 read seam ────────────────────────────────────────────

test("parseVariantMetadata DEGRADES to {} and never throws — a history read must survive an unmodelled row", () => {
  // The whole reason the seam is `.catch` and not `.parse`: one old row nobody models must not fail the read
  // that lists a chat. Every shape a corrupt column can hold resolves to the same empty sidecar.
  expect(parseVariantMetadata(null)).toEqual({});
  expect(parseVariantMetadata(undefined)).toEqual({});
  expect(parseVariantMetadata("not an object")).toEqual({});
  expect(parseVariantMetadata([1, 2, 3])).toEqual({});
  expect(parseVariantMetadata({ [VARIANT_METADATA_REASONING_MS_KEY]: "soon" })).toEqual({});
});

test("parseVariantMetadata keeps the two keys that have named readers and DROPS an unmodelled top-level key", () => {
  // `reasoning_duration` (the stats rollups' json_extract path) and `token_count` (domain/import's token-usage
  // backfill) are the two DECLARED keys; anything else at the modeled level is foreign and is stripped, which
  // is what makes "a reader names a typed field or does not compile" true of the read side too.
  const parsed = parseVariantMetadata({
    [VARIANT_METADATA_REASONING_MS_KEY]: 1200,
    [VARIANT_METADATA_TOKEN_COUNT_KEY]: 42,
    somethingAForeignToolWrote: "x",
  });
  expect(parsed[VARIANT_METADATA_REASONING_MS_KEY]).toBe(1200);
  expect(parsed[VARIANT_METADATA_TOKEN_COUNT_KEY]).toBe(42);
  expect(Object.keys(parsed).sort()).toEqual([VARIANT_METADATA_REASONING_MS_KEY, VARIANT_METADATA_TOKEN_COUNT_KEY].sort());
});

test("the providerMetadata union is CLOSED by provider — an unknown provider is not admitted as a named arm", () => {
  // §5.3c: a plugin provider lands under the `plugin:<ns>/<id>` arm with an opaque `raw` and NO reader by key;
  // an arbitrary provider word is NOT an arm, so no reader can ever see a shape nothing in contracts declares.
  const openrouter = parseVariantMetadata({ providerMetadata: { provider: "openrouter", upstreamCost: 0.12 } });
  expect(openrouter.providerMetadata).toEqual({ provider: "openrouter", upstreamCost: 0.12 });
  const plugin = parseVariantMetadata({ providerMetadata: { provider: "plugin:acme/vision", raw: { anything: true } } });
  expect(plugin.providerMetadata?.provider).toBe("plugin:acme/vision");
  // An unmodelled provider word fails the union — and because the seam is `.catch({})`, the WHOLE sidecar
  // degrades rather than half-landing. That is the specified behaviour: a blob we cannot model is no blob.
  expect(parseVariantMetadata({ providerMetadata: { provider: "some-new-vendor", cost: 1 } })).toEqual({});
});

test("the plugin arm's id is a TEMPLATE LITERAL — it validates the pattern and does not absorb the named arms", () => {
  // The type half is what a value test cannot see and is the whole reason for the spelling: as a bare
  // `z.string().regex(…)` the plugin arm's `provider` was `string`, which SWALLOWED every named literal, so
  // `meta.provider === "claude-sub"` narrowed to `claude-sub | plugin` and reading `warmSpareClaimed` off the
  // result did not compile — the union's own promise, broken by its most permissive arm. The narrow below
  // compiles only under the template-literal spelling; `tsc` is the assertion.
  const claudeSub = parseVariantMetadata({ providerMetadata: { provider: "claude-sub", warmSpareClaimed: true, cacheCreation1hTokens: 4096 } });
  const arm = claudeSub.providerMetadata;
  expect(arm !== undefined && arm.provider === "claude-sub" && arm.warmSpareClaimed).toBe(true);

  // The runtime half: `templateLiteral` composes its parts' patterns, so the id is still fully validated.
  // A half-formed plugin id degrades the WHOLE sidecar (`.catch({})`) rather than landing an unaddressable row.
  for (const bad of ["plugin:BAD", "plugin:acme", "plugin:acme/vision/extra", "plugin:", "notplugin:acme/vision"]) {
    expect(parseVariantMetadata({ providerMetadata: { provider: bad, raw: {} } }), `${bad} must not parse as a plugin arm`).toEqual({});
  }
});

test("importResidue is declared-OPAQUE: any JSON rides, and a non-JSON value is refused", () => {
  // The ST import's doorway (§5.3c class 4). It is `JsonValue`, never `Record<string, unknown>` — storable
  // and re-parsable by construction, and unreadable by key without an explicit narrow.
  const residue = { api: "openrouter", bias: "x", nested: { a: [1, "two", null] } };
  expect(parseVariantMetadata({ importResidue: residue }).importResidue).toEqual(residue);
  // A function is not JSON; the sidecar degrades rather than persisting something that cannot round-trip.
  expect(variantMetadataSchema.safeParse({ importResidue: (): number => 1 }).success).toBe(false);
});
