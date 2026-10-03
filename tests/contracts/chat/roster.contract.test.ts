import type {
  DeploymentRenderPolicy,
  InvitePreview,
  InviteView,
  MemberCardView,
  ParticipantView,
  RenderPolicy,
  RenderPolicyOverride,
} from "@orb/contracts/chat";
import {
  acceptInviteSchema,
  allowsInteractiveCards,
  characterMemberSpecSchema,
  createInviteSchema,
  HTML_TRUST_STEPS,
  previewInviteSchema,
  redeemInviteSchema,
  renderPolicyOverrideForStep,
  rendersTrustedHtml,
  resolveRenderPolicy,
  rosterMemberSpecSchema,
  seatKnobsSchema,
  stepFromRenderPolicyOverride,
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
  expect(acceptInviteSchema.safeParse({ inviteId: SAMPLE_CHAT_ID }).success).toBe(false);
  expect(acceptInviteSchema.safeParse({ inviteId: "chat_invite_not-a-typeid" }).success).toBe(false);
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
    allowSignup: false,
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
    editableTags: null,
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

// Both media fixtures carry `allowInteractiveCards: true`, the SHIPPED floor
// (`domain/settings/effective-config/layer.ts`), so the media tests run on the deployment a fresh box has.
// The ceiling's other position gets its own fixture + its own tests further down.
const BLOCKING_DEPLOYMENT: DeploymentRenderPolicy = { trustHtml: false, forbidExternalMedia: true, allowInteractiveCards: true };
const PERMISSIVE_DEPLOYMENT: DeploymentRenderPolicy = { trustHtml: false, forbidExternalMedia: false, allowInteractiveCards: true };
/** The REVOCATION: an operator who switched interactive cards off deployment-wide. */
const INTERACTIVE_FORBIDDEN: DeploymentRenderPolicy = { trustHtml: false, forbidExternalMedia: false, allowInteractiveCards: false };
const CARD_ALLOWS: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: false, interactiveHtml: null };
const CARD_FORBIDS: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: true, interactiveHtml: null };
const CARD_INHERITS: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: null, interactiveHtml: null };

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

test("the RENDER step keeps `override ?? deployment` — the per-character escalation path is DELIBERATE (D44 §12.0)", () => {
  // The ceiling is DOWN here so an inheriting card lands on the render step itself rather than on the rung
  // above it; the ceiling's own tests are below.
  const deployment: DeploymentRenderPolicy = { trustHtml: false, forbidExternalMedia: false, allowInteractiveCards: false };
  expect(resolveRenderPolicy(deployment, { trustHtml: true, forbidExternalMedia: null, interactiveHtml: null }).htmlTrust).toBe("trusted");
  expect(resolveRenderPolicy(deployment, CARD_INHERITS).htmlTrust).toBe("untrusted");
  // …and a card may force UNtrusted below an admin-global opt-in.
  expect(resolveRenderPolicy({ ...deployment, trustHtml: true }, { trustHtml: false, forbidExternalMedia: null, interactiveHtml: null }).htmlTrust).toBe(
    "untrusted",
  );
});

test("the axes are INDEPENDENT — an HTML-trust opt-in does not drag external media open", () => {
  expect(resolveRenderPolicy(BLOCKING_DEPLOYMENT, { trustHtml: true, forbidExternalMedia: false, interactiveHtml: null })).toEqual({
    htmlTrust: "trusted",
    forbidExternalMedia: true,
  });
});

// ═══ THE HTML-TRUST LADDER — untrusted < trusted < interactive (owner ruling 2026-08-16, #111) ═════════
//
// ONE ordered axis, so no consumer can read two booleans and invent a fourth state.
//
// DEFAULT-ON, WITH ONE CEILING (owner ruling: interactive cards on by default for every character). A card on
// "Inherit default" — both ladder columns `null`, which is every card nobody set, imported ones included —
// resolves to the top rung while the deployment `allowInteractiveCards` ceiling is up. The ceiling is still
// an AND over every route to the rung, because the rung runs model-authored code and carries a WebRTC beacon
// no CSP directive can close: switching it off is the revocation. A lower rung stored on the card is the
// per-character disable. These pins replace the earlier "never-opted-in stays static" ones: they assert both
// routes to the rung, the veto over both, and every explicit lower answer.

test("the ladder is ordered, and its order is the API — untrusted < trusted < interactive", () => {
  expect([...HTML_TRUST_STEPS]).toEqual(["untrusted", "trusted", "interactive"]);
  expect(HTML_TRUST_STEPS.map(rendersTrustedHtml)).toEqual([false, true, true]);
  expect(HTML_TRUST_STEPS.map(allowsInteractiveCards)).toEqual([false, false, true]);
});

test("an INHERITING card resolves to the top rung under the ceiling — the default-on ruling", () => {
  // Both media fixtures, because the media axis is unrelated to the ladder.
  expect(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, CARD_INHERITS).htmlTrust).toBe("interactive");
  expect(resolveRenderPolicy(BLOCKING_DEPLOYMENT, CARD_INHERITS).htmlTrust).toBe("interactive");
  // `forbidExternalMedia` is not part of the ladder: a card that set only that column still inherits it.
  expect(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, CARD_FORBIDS).htmlTrust).toBe("interactive");
});

test("THE REVOCATION: with the ceiling down, neither the default nor an opt-in reaches the rung", () => {
  const opted: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: null, interactiveHtml: true };
  expect(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, opted).htmlTrust).toBe("interactive");
  // This is the kill-switch, the only control over the grant's WebRTC residual, so it is asserted as an
  // absolute over BOTH routes to the rung.
  expect(allowsInteractiveCards(resolveRenderPolicy(INTERACTIVE_FORBIDDEN, opted).htmlTrust)).toBe(false);
  expect(allowsInteractiveCards(resolveRenderPolicy(INTERACTIVE_FORBIDDEN, CARD_INHERITS).htmlTrust)).toBe(false);
  // An inheriting card lands on the deployment's own render default, not on a rung it never stored.
  expect(resolveRenderPolicy(INTERACTIVE_FORBIDDEN, CARD_INHERITS).htmlTrust).toBe("untrusted");
  expect(resolveRenderPolicy({ ...INTERACTIVE_FORBIDDEN, trustHtml: true }, CARD_INHERITS).htmlTrust).toBe("trusted");
});

test("a vetoed card falls back to its OWN stored render answer, never to a rung it did not store", () => {
  // Opted in through the one ladder control ⇒ the stored pair is {trustHtml: true, interactiveHtml: true},
  // so the veto lands it on `trusted` — it keeps the card styling the host chose, minus the scripts.
  const viaLadder: RenderPolicyOverride = { ...renderPolicyOverrideForStep("interactive"), forbidExternalMedia: null };
  expect(resolveRenderPolicy(INTERACTIVE_FORBIDDEN, viaLadder).htmlTrust).toBe("trusted");
  // The contradictory pair (direct API write only) stored `trustHtml: false`, so the veto lands it on
  // `untrusted`. The vetoed answer is read off the card's own columns, never invented by the resolver.
  const contradictory: RenderPolicyOverride = { trustHtml: false, forbidExternalMedia: null, interactiveHtml: true };
  expect(resolveRenderPolicy(INTERACTIVE_FORBIDDEN, contradictory).htmlTrust).toBe("untrusted");
});

test("THE PER-CHARACTER DISABLE: every explicit lower answer stays off the rung under the ceiling", () => {
  for (const [label, override] of [
    // The two lower rungs of the one ladder control.
    ["Render HTML", { ...renderPolicyOverrideForStep("trusted"), forbidExternalMedia: null }],
    ["Untrusted", { ...renderPolicyOverrideForStep("untrusted"), forbidExternalMedia: null }],
    // An explicit opt-out beside an inherited render step (a pre-ladder or direct API write): the `false`
    // is the host's answer and wins over the default.
    ["opted out, render inherited", { trustHtml: null, forbidExternalMedia: null, interactiveHtml: false }],
    // A render answer with no interactive column (a handoff copy, a pre-ladder row): explicit, not inherit.
    ["trusted, interactive unset", { trustHtml: true, forbidExternalMedia: null, interactiveHtml: null }],
    ["untrusted, interactive unset", { trustHtml: false, forbidExternalMedia: null, interactiveHtml: null }],
  ] as const) {
    expect(allowsInteractiveCards(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, override).htmlTrust), label).toBe(false);
  }
});

test("FAIL-CLOSED: no card at all (`null`) is NOT an inheriting card and never reaches the rung", () => {
  // A human seat or an unreadable card row resolves through `null`; treating it as "Inherit default" would
  // hand the script posture to content no character row vouches for.
  expect(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, null).htmlTrust).toBe("untrusted");
  expect(resolveRenderPolicy({ ...PERMISSIVE_DEPLOYMENT, trustHtml: true }, null).htmlTrust).toBe("trusted");
});

test("a TRUSTED card is not thereby interactive — the rung above is its own host act", () => {
  const trusted: RenderPolicyOverride = { trustHtml: true, forbidExternalMedia: null, interactiveHtml: null };
  const resolved: RenderPolicy = resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, trusted);
  expect(resolved.htmlTrust).toBe("trusted");
  expect(allowsInteractiveCards(resolved.htmlTrust)).toBe(false);
});

test("INTERACTIVE IMPLIES TRUSTED: the contradictory stored pair cannot resolve to a fourth state", () => {
  // Only reachable by a direct API write — the one ladder control cannot produce it. It must NOT resolve
  // to "runs scripts but renders untrusted"; the ladder has no such rung, and the top one wins.
  const contradictory: RenderPolicyOverride = { trustHtml: false, forbidExternalMedia: null, interactiveHtml: true };
  const resolved = resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, contradictory);
  expect(resolved.htmlTrust).toBe("interactive");
  expect(rendersTrustedHtml(resolved.htmlTrust)).toBe(true);
});

test("the write direction round-trips: a step → its stored pair → the same step", () => {
  for (const step of HTML_TRUST_STEPS) {
    const stored = renderPolicyOverrideForStep(step);
    expect(stepFromRenderPolicyOverride(stored)).toBe(step);
    // …and the resolver agrees with the read-back, on either deployment tier.
    expect(resolveRenderPolicy(PERMISSIVE_DEPLOYMENT, { ...stored, forbidExternalMedia: null }).htmlTrust).toBe(step);
  }
  // An un-overridden render step reads back as "inherit", not as a rung.
  expect(stepFromRenderPolicyOverride({ trustHtml: null, interactiveHtml: null })).toBeNull();
  expect(stepFromRenderPolicyOverride({ trustHtml: null, interactiveHtml: false })).toBeNull();
});
