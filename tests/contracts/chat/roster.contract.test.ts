import type { InvitePreview, InviteView, MemberCardView, ParticipantView, RenderPolicy, RenderPolicyOverride } from "@orb/contracts/chat";
import {
  acceptInviteSchema,
  characterMemberSpecSchema,
  createInviteSchema,
  previewInviteSchema,
  redeemInviteSchema,
  resolveRenderPolicy,
  rosterMemberSpecSchema,
  seatKnobsSchema,
} from "@orb/contracts/chat";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

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

// ═══ resolveRenderPolicy — the ONE tier-combine (owner ruling 2026-08-01: TIGHTEN-ONLY) ════
//
// The deployment "Block external media" AppSetting is an ABSOLUTE ceiling: a per-character override may
// only restrict FURTHER. The bug this pins: the old inline `override ?? deployment` let a card carrying
// `forbidExternalMedia: false` re-open external media on a deployment that blocks it — a dead opt-in the
// document CSP (built from the DEPLOYMENT value alone) then blocked anyway. `trustHtml` deliberately keeps
// `override ?? deployment`: its deployment value is a DEFAULT sitting at the strict end, not a block.

const BLOCKING_DEPLOYMENT: RenderPolicy = { trustHtml: false, forbidExternalMedia: true };
const PERMISSIVE_DEPLOYMENT: RenderPolicy = { trustHtml: false, forbidExternalMedia: false };
const CARD_ALLOWS: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: false };
const CARD_FORBIDS: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: true };
const CARD_INHERITS: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: null };

test("deployment BLOCKS + card allows ⇒ BLOCKED — a lower tier can never widen past the deployment ceiling", () => {
  expect(resolveRenderPolicy(BLOCKING_DEPLOYMENT, CARD_ALLOWS).forbidExternalMedia).toBe(true);
  // …and the same for the inherit and forbid arms: while the deployment blocks, EVERY value is blocked.
  expect(resolveRenderPolicy(BLOCKING_DEPLOYMENT, CARD_INHERITS).forbidExternalMedia).toBe(true);
  expect(resolveRenderPolicy(BLOCKING_DEPLOYMENT, CARD_FORBIDS).forbidExternalMedia).toBe(true);
  expect(resolveRenderPolicy(BLOCKING_DEPLOYMENT, null).forbidExternalMedia).toBe(true);
});

test("deployment ALLOWS + card forbids ⇒ BLOCKED (tightening still works — the override is not ignored)", () => {
  expect(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, CARD_FORBIDS).forbidExternalMedia).toBe(true);
});

test("deployment ALLOWS + card allows/inherits ⇒ ALLOWED (the resolver is not a blanket deny)", () => {
  expect(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, CARD_ALLOWS).forbidExternalMedia).toBe(false);
  expect(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, CARD_INHERITS).forbidExternalMedia).toBe(false);
  expect(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, null).forbidExternalMedia).toBe(false);
});

test("trustHtml keeps `override ?? deployment` — the per-character escalation path is DELIBERATE (D44 §12.0)", () => {
  const deployment: RenderPolicy = { trustHtml: false, forbidExternalMedia: false };
  expect(resolveRenderPolicy(deployment, { trustHtml: true, forbidExternalMedia: null }).trustHtml).toBe(true);
  expect(resolveRenderPolicy(deployment, CARD_INHERITS).trustHtml).toBe(false);
  // …and a card may force UNtrusted below an admin-global opt-in.
  expect(resolveRenderPolicy({ trustHtml: true, forbidExternalMedia: false }, { trustHtml: false, forbidExternalMedia: null }).trustHtml).toBe(false);
});

test("the two axes are INDEPENDENT — a trustHtml opt-in does not drag external media open", () => {
  expect(resolveRenderPolicy(BLOCKING_DEPLOYMENT, { trustHtml: true, forbidExternalMedia: false })).toEqual({
    trustHtml: true,
    forbidExternalMedia: true,
  });
});
