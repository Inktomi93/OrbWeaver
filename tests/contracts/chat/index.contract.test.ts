import type {
  AssembleCharacter,
  AssembleContext,
  AssembledPrompt,
  AssemblePersona,
  AssembleTrace,
  AssembleWorldEntry,
  ChatBusEvent,
  ChatDeltaEvent,
  ChatInjection,
  InvitePreview,
  InviteView,
  MemberCardView,
  MessageSlot,
  MessageView,
  ParticipantView,
  SectionPreview,
} from "@orb/contracts/chat";
import {
  CHAT_BUS_EVENT_TYPES,
  createInviteSchema,
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  groupConfigSchema,
  isChatBusEventType,
  MEMBER_CARD_VISIBILITY_LEVELS,
  memberCardVisibilitySchema,
  messageContentBlockSchema,
  messageRoleSchema,
  messageSlotSchema,
  openingPolicySchema,
  previewInviteSchema,
  redeemInviteSchema,
  roomOverridesSchema,
} from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { expect, test } from "../../support/fixtures";

// Type-level pins (D26 slot-has-no-content / view-has-content, the ChatBusEvent secret-unrepresentable
// allowlist, and the InviteView no-token-leak pin) live in `index.test-d.ts` (core/Spine-Testing.md §1). This
// file keeps the runtime round-trips, the schema strip backstops, and the value-level shape checks.

// ── Sample ids (minted/cast — no pasted random-looking literals; noSecrets) ───
const SAMPLE_MESSAGE_ID = mintTypeId(ID_PREFIX.message);
const SAMPLE_CHAT_ID = mintTypeId(ID_PREFIX.chat);
const SAMPLE_VARIANT_ID = mintTypeId(ID_PREFIX.messageVariant);
const SAMPLE_CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const SAMPLE_PERSONA_ID = mintTypeId(ID_PREFIX.persona);
const SAMPLE_PARTICIPANT_ID = mintTypeId(ID_PREFIX.chatParticipant);
const SAMPLE_INVITE_ID = mintTypeId(ID_PREFIX.chatInvite);
const SAMPLE_USER_ID = castId<UserId>("user-alice");
const SAMPLE_HANDLE = castId<Handle>("alice");

// ═══ messageRoleSchema — THE canonical role wire (D32) ══════════════════════════

test("messageRoleSchema is z.enum(MESSAGE_ROLES) and round-trips system|user|assistant", () => {
  for (const role of MESSAGE_ROLES) {
    expect(messageRoleSchema.parse(role)).toBe(role);
  }
  expect(messageRoleSchema.options).toEqual(["system", "user", "assistant"]);
  expect(messageRoleSchema.safeParse("tool").success).toBe(false);
});

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
  };
  expect(view.content).toBe("hello there");
  expect(view.selectedVariantId).toBe(SAMPLE_VARIANT_ID);
});

// ═══ groupConfigSchema — memberCardVisibility default sheet (D22) ════════════════

test("groupConfigSchema fills memberCardVisibility to 'sheet' by default (D22)", () => {
  const parsed = groupConfigSchema.parse({ output: "per-speaker", policy: "natural" });
  expect(parsed.memberCardVisibility).toBe("sheet");
  expect(DEFAULT_GROUP_CONFIG.memberCardVisibility).toBe("sheet");
});

test("memberCardVisibility levels are the four D22 levels (floor → full)", () => {
  expect(MEMBER_CARD_VISIBILITY_LEVELS).toEqual(["name-avatar", "sheet", "sheet+lore", "full"]);
  for (const level of MEMBER_CARD_VISIBILITY_LEVELS) {
    expect(memberCardVisibilitySchema.parse(level)).toBe(level);
  }
});

test("groupConfig narrator arm defaults memberCardVisibility AND rejects a stray cardScope (.strict)", () => {
  const narrator = groupConfigSchema.parse({ output: "narrator", policy: "list" });
  expect(narrator.memberCardVisibility).toBe("sheet");
  // narrator ⇒ merged: cardScope is unrepresentable on this arm; .strict() REJECTS it.
  const withStray = groupConfigSchema.safeParse({
    output: "narrator",
    policy: "list",
    cardScope: "scoped",
  });
  expect(withStray.success).toBe(false);
});

test("DEFAULT_GROUP_CONFIG is per-speaker × merged, auto-mode off", () => {
  expect(DEFAULT_GROUP_CONFIG.output).toBe("per-speaker");
  expect(DEFAULT_GROUP_CONFIG.autoMode).toBe(false);
});

// ═══ roomOverrides — exactly the four-field allowlist (.strict) ══════════════════

test("roomOverridesSchema round-trips the four allowlisted fields and rejects any other", () => {
  const overrides = {
    scenario: "a quiet tavern",
    mainPrompt: "be terse",
    postHistory: "stay in character",
    authorsNote: "it is raining",
  };
  expect(roomOverridesSchema.parse(overrides)).toEqual(overrides);
  expect(Object.keys(roomOverridesSchema.shape).sort()).toEqual(
    ["authorsNote", "mainPrompt", "postHistory", "scenario"].sort(),
  );
  // A stray field (e.g. a member trying to inject a room-wide persona) is rejected, not carried.
  expect(roomOverridesSchema.safeParse({ persona: "evil twin" }).success).toBe(false);
  expect(DEFAULT_ROOM_OVERRIDES).toEqual({});
});

// ═══ openingPolicy ══════════════════════════════════════════════════════════════

test("openingPolicySchema round-trips its members", () => {
  for (const policy of ["greet-all", "generate", "none", "first-message"] as const) {
    expect(openingPolicySchema.parse(policy)).toBe(policy);
  }
  expect(openingPolicySchema.safeParse("auto").success).toBe(false);
});

// ═══ invites (D16) ══════════════════════════════════════════════════════════════

test("createInviteSchema accepts an empty share-link and a targeted-by-handle invite", () => {
  expect(createInviteSchema.parse({})).toEqual({});
  const targeted = { maxUses: 3, invitedHandle: SAMPLE_HANDLE, expiresAt: null };
  expect(createInviteSchema.parse(targeted)).toEqual(targeted);
  // maxUses below the floor is rejected.
  expect(createInviteSchema.safeParse({ maxUses: 0 }).success).toBe(false);
});

test("preview/redeem invite params require a token", () => {
  expect(previewInviteSchema.parse({ token: "share-token" })).toEqual({ token: "share-token" });
  expect(redeemInviteSchema.parse({ token: "share-token" })).toEqual({ token: "share-token" });
  expect(redeemInviteSchema.safeParse({}).success).toBe(false);
});

test("InviteView / InvitePreview pin the host + accept-flow shapes (no token leaks)", () => {
  const inviteView: InviteView = {
    id: SAMPLE_INVITE_ID,
    chatId: SAMPLE_CHAT_ID,
    status: "pending",
    maxUses: 5,
    remainingUses: 4,
    expiresAt: null,
    invitedUserId: null,
    createdAt: 1,
  };
  // The InviteView wire shape exposes NO token (raw or hashed) — a leak would let anyone redeem.
  // (Type-level no-token pin: see index.test-d.ts.)
  expect("token" in inviteView).toBe(false);
  const preview: InvitePreview = {
    chatId: SAMPLE_CHAT_ID,
    roomName: "The Tavern",
    hostHandle: SAMPLE_HANDLE,
    memberCount: 3,
    modeLabel: "per-speaker · natural",
  };
  // The preview is identity-free: no roster, no history.
  expect(Object.keys(preview).sort()).toEqual(
    ["chatId", "hostHandle", "memberCount", "modeLabel", "roomName"].sort(),
  );
});

// ═══ roster + member-card views ════════════════════════════════════════════════

test("ParticipantView pins the roster row (membership-scoped; XOR human/character)", () => {
  const human: ParticipantView = {
    id: SAMPLE_PARTICIPANT_ID,
    chatId: SAMPLE_CHAT_ID,
    kind: "human",
    userId: SAMPLE_USER_ID,
    characterId: null,
    role: "host",
    activePersonaId: SAMPLE_PERSONA_ID,
    talkativeness: 0.5,
    disabled: false,
    joinedAt: 1,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "from-join",
    displayName: "Alice",
    handle: SAMPLE_HANDLE,
    avatarAssetId: null,
  };
  expect(human.role).toBe("host");
  expect(human.leftSeq).toBeNull();
});

test("MemberCardView is a level-clamped projection — full-only fields null at 'sheet' (D22)", () => {
  const sheetView: MemberCardView = {
    characterId: SAMPLE_CHARACTER_ID,
    visibility: "sheet",
    name: "Aria",
    avatarAssetId: null,
    description: "a wandering bard",
    personality: "cheerful",
    scenario: null,
    greetings: ["Hello!"],
    exampleMessages: null,
    tags: ["bard"],
    creatorNotes: null,
    // above the 'sheet' clamp ⇒ null
    lore: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    authorsNoteDepth: null,
  };
  expect(sheetView.visibility).toBe("sheet");
  expect(sheetView.systemPrompt).toBeNull();
  expect(sheetView.name).toBe("Aria");
});

// ═══ ChatDeltaEvent + ChatBusEvent ═════════════════════════════════════════════

test("ChatDeltaEvent carries text and reasoning chunks", () => {
  const textDelta: ChatDeltaEvent = { chatId: SAMPLE_CHAT_ID, kind: "text", text: "hi" };
  const reasoningDelta: ChatDeltaEvent = {
    chatId: SAMPLE_CHAT_ID,
    kind: "reasoning",
    text: "thinking",
  };
  expect(textDelta.kind).toBe("text");
  expect(reasoningDelta.kind).toBe("reasoning");
});

test("CHAT_BUS_EVENT_TYPES is the exhaustive discriminator set incl. the embedded WI events", () => {
  // The guard recognizes a chat-owned event AND an embedded world-info event; rejects an unknown.
  expect(isChatBusEventType("messageCommitted")).toBe(true);
  expect(isChatBusEventType("wiBookAttached")).toBe(true);
  expect(isChatBusEventType("credentialLeaked")).toBe(false);
  expect(isChatBusEventType("worldInfoActivated")).toBe(true);
  expect(isChatBusEventType("chatOpened")).toBe(true);
  expect(isChatBusEventType("warning")).toBe(true);
  expect(isChatBusEventType("messageHidden")).toBe(true);
  // 21 chat-owned (incl. the D45 `warning` + the PD-86 `messageHidden`) + 5 WI variants.
  expect(Object.keys(CHAT_BUS_EVENT_TYPES)).toHaveLength(26);
});

test("a representative ChatBusEvent round-trips its public, secret-free shape", () => {
  const committed: ChatBusEvent = {
    type: "messageCommitted",
    chatId: SAMPLE_CHAT_ID,
    messageId: SAMPLE_MESSAGE_ID,
  };
  const turnStarted: ChatBusEvent = {
    type: "turnStarted",
    chatId: SAMPLE_CHAT_ID,
    intent: "send",
    api: "chat-completions",
    source: "openrouter",
    model: "claude-sonnet",
    speakerCharacterId: null,
    targetMessageId: null,
  };
  expect(committed.type).toBe("messageCommitted");
  expect(turnStarted.type).toBe("turnStarted");
  // turnStarted carries no caller id (D19 — attribution is on the turn path, never the public bus).
  expect("callerUserId" in turnStarted).toBe(false);
});

test("chatOpened + worldInfoActivated round-trip their id-only shapes (event-bus ST parity, D50)", () => {
  const opened: ChatBusEvent = { type: "chatOpened", chatId: SAMPLE_CHAT_ID };
  const wiFired: ChatBusEvent = {
    type: "worldInfoActivated",
    chatId: SAMPLE_CHAT_ID,
    entryIds: [mintTypeId(ID_PREFIX.worldEntry)],
  };
  expect(opened.type).toBe("chatOpened");
  expect(wiFired.entryIds).toHaveLength(1);
});

// The compile-time pin that credentials / secrets / caller id are UNREPRESENTABLE in ChatBusEvent moved to
// index.test-d.ts (bus-payload allowlist). The runtime secret-strip backstop lives on messageSlotSchema above
// (ChatBusEvent itself is schema-less — never zod-parsed), and the no-caller-id check sits in the
// representative-round-trip test above.

// ═══ the 8 assemble shapes (slim projections) ══════════════════════════════════

test("the 8 assemble shapes pin (slim projections; AssembleContext refs PromptConfig)", () => {
  const character: AssembleCharacter = { name: "Aria", description: "a bard" };
  const persona: AssemblePersona = { name: "Alice", description: "the user" };
  const entry: AssembleWorldEntry = {
    content: "the kingdom of Eld",
    scope: "always",
    keys: [],
    priority: 100,
    enabled: true,
    source: "character",
    position: "before",
    inject: { depth: 2, role: "system" },
  };
  const injection: ChatInjection = {
    position: "in_chat",
    depth: 0,
    role: "user",
    content: "[note]",
  };
  const trace: AssembleTrace = {
    staticSections: ["main"],
    dynamicSections: [],
    worldInfoIncluded: 1,
    worldInfoDropped: [],
    matchedKeys: [],
    compactSummaryIncluded: false,
    memoryIncluded: false,
    guidedInstructionIncluded: false,
    staticCacheBusters: [],
    chatInjectionsIncluded: 0,
    afterHistorySections: [],
  };
  const assembled: AssembledPrompt = {
    static: "system",
    dynamic: "",
    afterHistory: [injection],
    sendHistory: true,
    trace,
  };
  const ctx: AssembleContext = {
    character,
    promptConfig: DEFAULT_PROMPT_CONFIG,
    recentMessages: ["hi"],
    pinnedPersona: persona,
  };
  const sectionPreview: SectionPreview = { rendered: "system", half: "static", trace };
  expect(ctx.promptConfig).toBe(DEFAULT_PROMPT_CONFIG);
  expect(assembled.afterHistory[0]?.role).toBe("user");
  expect(entry.inject?.role).toBe("system");
  expect(sectionPreview.half).toBe("static");
});

test("messageContentBlockSchema — round-trips its three kinds (D44)", () => {
  for (const block of [
    { kind: "markdown", md: "hi" },
    { kind: "media", media: "image", src: { kind: "external", url: "https://x/y.png" }, alt: "y" },
    { kind: "html-card", html: "<div></div>", css: ".a{}", trust: "tierB" },
  ]) {
    expect(messageContentBlockSchema.parse(block)).toEqual(block);
  }
});
