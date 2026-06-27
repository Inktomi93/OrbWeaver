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
import { expect, test } from "vitest";

// ── Compile-time identity helpers (type-level pins) ───────────────────────────
type Assert<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
/** Distributes over each union member M; `K extends keyof M` is `false` for every member unless one
 *  declares K. The union collapses to `false` only when NO member has K. */
type UnionMemberHasKey<U, K extends PropertyKey> = U extends unknown
  ? K extends keyof U
    ? true
    : false
  : never;

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

test("MessageSlot has no `content` key at the type level (D26)", () => {
  type _NoContentOnSlot = Assert<Equal<UnionMemberHasKey<MessageSlot, "content">, false>>;
  // The JOIN view (slot + selected variant) DOES carry content — that is the read model.
  type _ViewHasContent = Assert<Equal<UnionMemberHasKey<MessageView, "content">, true>>;
  expect(true).toBe(true);
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
  expect("token" in inviteView).toBe(false);
  type _NoToken = Assert<Equal<UnionMemberHasKey<InviteView, "token">, false>>;
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
  // 17 chat-owned + 5 WI variants.
  expect(Object.keys(CHAT_BUS_EVENT_TYPES)).toHaveLength(22);
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
    targetMessageId: null,
  };
  expect(committed.type).toBe("messageCommitted");
  expect(turnStarted.type).toBe("turnStarted");
  // turnStarted carries no caller id (D19 — attribution is on the turn path, never the public bus).
  expect("callerUserId" in turnStarted).toBe(false);
});

test("credentials / secrets are TYPE-LEVEL UNREPRESENTABLE in ChatBusEvent (bus-payload allowlist)", () => {
  // No bus member declares a secret-bearing field; each check collapses to `false`. If a member gained
  // one, the union would widen to `boolean` and Equal<…, false> would fail `tsc`.
  type _NoApiKey = Assert<Equal<UnionMemberHasKey<ChatBusEvent, "apiKey">, false>>;
  type _NoSecret = Assert<Equal<UnionMemberHasKey<ChatBusEvent, "secret">, false>>;
  type _NoCredential = Assert<Equal<UnionMemberHasKey<ChatBusEvent, "credential">, false>>;
  type _NoToken = Assert<Equal<UnionMemberHasKey<ChatBusEvent, "token">, false>>;
  type _NoBaseUrl = Assert<Equal<UnionMemberHasKey<ChatBusEvent, "baseUrl">, false>>;
  type _NoPassword = Assert<Equal<UnionMemberHasKey<ChatBusEvent, "password">, false>>;
  type _NoCallerId = Assert<Equal<UnionMemberHasKey<ChatBusEvent, "callerUserId">, false>>;
  expect(true).toBe(true);
});

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
