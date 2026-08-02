import type { MessageSlot, MessageView, UserMacroDraws } from "@orb/contracts/chat";
import {
  isStateAnchorSlot,
  lastVisibleAssistant,
  lastVisibleRow,
  messageSlotSchema,
  reattributeScopeSchema,
  toolCallRecordSchema,
  userMacroDrawsSchema,
} from "@orb/contracts/chat";
import type { MessageId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

// ── Sample ids (minted/cast — no pasted random-looking literals; noSecrets) ───
const SAMPLE_MESSAGE_ID = mintTypeId(ID_PREFIX.message);
const SAMPLE_CHAT_ID = mintTypeId(ID_PREFIX.chat);
const SAMPLE_VARIANT_ID = mintTypeId(ID_PREFIX.messageVariant);
const SAMPLE_CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const SAMPLE_PERSONA_ID = mintTypeId(ID_PREFIX.persona);
const SAMPLE_USER_ID = castId<UserId>("user-alice");

// ═══ D26 — the message SLOT carries NO content; content lives on the variant ════

test("messageSlotSchema round-trips a valid slot", () => {
  const slot: MessageSlot = {
    id: SAMPLE_MESSAGE_ID,
    chatId: SAMPLE_CHAT_ID,
    seq: 4,
    role: "assistant",
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
    cacheReadTokens: null,
    cacheWriteTokens: null,
    contextWindow: 200_000,
    costUsd: null,
    ttftMs: 120,
    genStartedAt: 1000,
    genFinishedAt: 4400,
    generationId: null,
    contextBoundaryMessageId: null,
    toolCalls: [],
  };
  expect(view.content).toBe("hello there");
  expect(view.selectedVariantId).toBe(SAMPLE_VARIANT_ID);
});

// ═══ STATE-ANCHOR SLOTS — the empty-body canon rows that KEY an rpg snapshot ═══
// Regression: the rpg host `resyncFromStory` / `editSnapshot` clone-forward mints `postNarratorMessage("")`
// — a durable EMPTY assistant slot no reader sees. Every "the tail" / "the last assistant" question must
// skip it: an anchor answering it makes a swipe/continue/rewrite target an INVISIBLE slot (appending a
// prose variant onto the snapshot's own message, moving the ladder head), and strips the swipe controls
// off the last visible reply. Observed live 2026-07-31 (chat_01kyw9dexbecrtvwvejswtxstk, 4 anchors).

function makeView(overrides: Partial<MessageView> & Pick<MessageView, "id" | "role" | "content">): MessageView {
  return {
    chatId: SAMPLE_CHAT_ID,
    seq: 0,
    authorUserId: null,
    characterId: null,
    personaId: null,
    excludedFromPrompt: false,
    createdAt: 1,
    editedAt: null,
    selectedVariantId: SAMPLE_VARIANT_ID,
    selectedVariantIdx: 0,
    variantCount: 1,
    hasContinuation: false,
    reasoning: null,
    model: null,
    provider: null,
    finishReason: null,
    stopReason: null,
    terminalReason: null,
    tokensIn: null,
    tokensOut: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    contextWindow: null,
    costUsd: null,
    ttftMs: null,
    genStartedAt: null,
    genFinishedAt: null,
    generationId: null,
    contextBoundaryMessageId: null,
    toolCalls: [],
    ...overrides,
  };
}

const REPLY = makeView({ id: castId<MessageId>("msg_reply"), role: "assistant", content: "the visible reply" });
const ANCHOR = makeView({ id: castId<MessageId>("msg_anchor"), role: "assistant", content: "" });
const PROMPT = makeView({ id: castId<MessageId>("msg_prompt"), role: "user", content: "what happens next?" });

test("isStateAnchorSlot discriminates the empty-body snapshot slot from a real row", () => {
  expect(isStateAnchorSlot({ content: "" })).toBe(true);
  // Whitespace-only is the same nothing (the shape stage's empty-row filter trims too).
  expect(isStateAnchorSlot({ content: "   \n " })).toBe(true);
  expect(isStateAnchorSlot(REPLY)).toBe(false);
  // The checkpoint-RESTORE narrator slot carries real prose — a message, never an anchor.
  expect(isStateAnchorSlot({ content: "Restored to a checkpoint." })).toBe(false);
});

test("lastVisibleRow skips a trailing state anchor — the tail is the last row a reader SEES", () => {
  expect(lastVisibleRow([PROMPT, REPLY, ANCHOR])?.id).toBe(REPLY.id);
  // The live shape: three resyncs in a row stack three anchors on the tail.
  expect(lastVisibleRow([PROMPT, REPLY, ANCHOR, ANCHOR, ANCHOR])?.id).toBe(REPLY.id);
  expect(lastVisibleRow([])).toBeUndefined();
  expect(lastVisibleRow([ANCHOR])).toBeUndefined();
  expect(lastVisibleRow([REPLY, PROMPT])?.id).toBe(PROMPT.id);
});

test("lastVisibleAssistant skips anchors — an anchor is a snapshot key, never a generation", () => {
  expect(lastVisibleAssistant([PROMPT, REPLY, ANCHOR])?.id).toBe(REPLY.id);
  // A trailing user turn doesn't hide the generation; an anchor above it doesn't become one.
  expect(lastVisibleAssistant([REPLY, ANCHOR, PROMPT])?.id).toBe(REPLY.id);
  expect(lastVisibleAssistant([PROMPT, ANCHOR])).toBeUndefined();
  expect(lastVisibleAssistant([])).toBeUndefined();
});

test("an anchor's unstamped boundary never masks the real last generation's stamp", () => {
  const stamped = makeView({
    id: castId<MessageId>("msg_stamped"),
    role: "assistant",
    content: "trimmed history reply",
    contextBoundaryMessageId: castId<MessageId>("msg_prompt"),
  });
  // Reading the ANCHOR's null here is what suppressed the boundary divider after a resync.
  expect(lastVisibleAssistant([PROMPT, stamped, ANCHOR])?.contextBoundaryMessageId).toBe(castId<MessageId>("msg_prompt"));
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

test("userMacroDrawsSchema refuses a non-string leaf (the draw is always the DRAWN string, never a pool/bool)", () => {
  // A random-pick POOL (string[]) is the INPUT VALUE, not the DRAW — the draw is the single chosen option.
  expect(userMacroDrawsSchema.safeParse({ mood: { tone: ["a", "b"] } }).success).toBe(false);
  expect(userMacroDrawsSchema.safeParse({ mood: { tone: true } }).success).toBe(false);
  // A flat (one-level) record is the wrong depth — every value must be an input→string sub-record.
  expect(userMacroDrawsSchema.safeParse({ mood: "grim" }).success).toBe(false);
});
