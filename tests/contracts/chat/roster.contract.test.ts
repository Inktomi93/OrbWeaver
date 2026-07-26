import type { InvitePreview, InviteView, MemberCardView, ParticipantView } from "@orb/contracts/chat";
import {
  acceptInviteSchema,
  characterMemberSpecSchema,
  createInviteSchema,
  previewInviteSchema,
  redeemInviteSchema,
  rosterMemberSpecSchema,
  seatKnobsSchema,
} from "@orb/contracts/chat";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

// ── Sample ids (minted/cast — no pasted random-looking literals; noSecrets) ───
const SAMPLE_CHAT_ID = mintTypeId(ID_PREFIX.chat);
const SAMPLE_CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const SAMPLE_PERSONA_ID = mintTypeId(ID_PREFIX.persona);
const SAMPLE_PARTICIPANT_ID = mintTypeId(ID_PREFIX.chatParticipant);
const SAMPLE_INVITE_ID = mintTypeId(ID_PREFIX.chatInvite);
const SAMPLE_USER_ID = castId<UserId>("user-alice");
const SAMPLE_HANDLE = castId<Handle>("alice");

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

test("acceptInviteSchema requires a branded inviteId (token-free accept-by-id)", () => {
  expect(acceptInviteSchema.parse({ inviteId: SAMPLE_INVITE_ID })).toEqual({
    inviteId: SAMPLE_INVITE_ID,
  });
  // No token field is accepted (the strip-unknown backstop) and the id is mandatory.
  expect(acceptInviteSchema.safeParse({}).success).toBe(false);
  expect(acceptInviteSchema.parse({ inviteId: SAMPLE_INVITE_ID, token: "x" })).toEqual({
    inviteId: SAMPLE_INVITE_ID,
  });
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
  expect(Object.keys(preview).sort()).toEqual(["chatId", "hostHandle", "memberCount", "modeLabel", "roomName"].sort());
});

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
    avatarHash: null,
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
    avatarHash: null,
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

// ═══ D80 — the ONE roster-member vocabulary (seatKnobsSchema + rosterMemberSpecSchema) ════

test("seatKnobsSchema accepts a bare {} (both knobs optional — absent talkativeness = inherit)", () => {
  expect(seatKnobsSchema.parse({})).toEqual({});
  expect(seatKnobsSchema.parse({ talkativeness: 0.7, disabled: true })).toEqual({ talkativeness: 0.7, disabled: true });
});

test("seatKnobsSchema clamps the talkativeness RANGE (0–1) — an out-of-range weight is rejected", () => {
  expect(seatKnobsSchema.safeParse({ talkativeness: 1.5 }).success).toBe(false);
  expect(seatKnobsSchema.safeParse({ talkativeness: -0.1 }).success).toBe(false);
});

test("rosterMemberSpecSchema round-trips the character arm (characterId + position + seat knobs)", () => {
  const spec = { kind: "character" as const, characterId: SAMPLE_CHARACTER_ID, position: 0, talkativeness: 0.5, disabled: false };
  expect(rosterMemberSpecSchema.parse(spec)).toEqual(spec);
  // characterMemberSpecSchema is the EXTRACTED arm (one home — the roster-preset narrow), not a re-spell.
  expect(characterMemberSpecSchema.parse(spec)).toEqual(spec);
});

test("rosterMemberSpecSchema rejects `human`, `observer`, and `agent` — humans join via invite only, observer is unseatable, no agent arm (D80)", () => {
  expect(rosterMemberSpecSchema.safeParse({ kind: "human", userId: SAMPLE_USER_ID, position: 0 }).success).toBe(false);
  expect(rosterMemberSpecSchema.safeParse({ kind: "observer", position: 0 }).success).toBe(false);
  expect(rosterMemberSpecSchema.safeParse({ kind: "agent", ownerUserId: SAMPLE_USER_ID, sourceKind: "buddy", position: 1 }).success).toBe(false);
});
