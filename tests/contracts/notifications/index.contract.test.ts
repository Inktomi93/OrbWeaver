import type { NotificationEvent, NotificationType, PresenceView } from "@orb/contracts/notifications";
import { AUTOMATION_NOTICE_MESSAGE_MAX, notificationEventSchema } from "@orb/contracts/notifications";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures";

// Sample values: TypeID ids are MINTED (valid prefix + suffix, so they pass the prefix-checking
// `typeIdSchema`); plain brands use the sanctioned `castId`. No pasted random-looking literals (noSecrets).
const SAMPLE_RECIPIENT = castId<UserId>("user-bob");
const SAMPLE_CHAT_ID = mintTypeId(ID_PREFIX.chat);
const SAMPLE_INVITE_ID = mintTypeId(ID_PREFIX.chatInvite);
const SAMPLE_HOST_HANDLE = castId<Handle>("alice");
const SAMPLE_NOMINEE_HANDLE = castId<Handle>("carol");
const SAMPLE_OWNER_ID = castId<UserId>("user-dave");
const SAMPLE_REQUESTER_HANDLE = castId<Handle>("dave");
const SAMPLE_CHARACTER_ID = mintTypeId(ID_PREFIX.character);
const SAMPLE_CARD_PROPOSAL_ID = mintTypeId(ID_PREFIX.cardEvolutionProposal);
const SAMPLE_AUTOMATION_RULE_ID = mintTypeId(ID_PREFIX.automationRule);
const SAMPLE_PLUGIN_ID = mintTypeId(ID_PREFIX.plugin);

// One fixture per closed variant. The compile-time `Record<NotificationType, …>` below makes this list
// EXHAUSTIVE: add a union member without a fixture and `tsc` goes red (the closed-union invariant).
const FIXTURES: Record<NotificationType, NotificationEvent> = {
  invite: {
    type: "invite",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    inviteId: SAMPLE_INVITE_ID,
    invitedByHandle: SAMPLE_HOST_HANDLE,
  },
  kicked: {
    type: "kicked",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
  },
  "handoff-nominated": {
    type: "handoff-nominated",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
  },
  "handoff-accepted": {
    type: "handoff-accepted",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    newHostHandle: SAMPLE_NOMINEE_HANDLE,
  },
  "deferred-turn-dropped": {
    type: "deferred-turn-dropped",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    reason: "consent",
  },
  "agent-seat-requested": {
    type: "agent-seat-requested",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    ownerUserId: SAMPLE_OWNER_ID,
    sourceKind: "buddy",
    requestedByHandle: SAMPLE_REQUESTER_HANDLE,
  },
  // The chat-crew card-evolution proposal (chat-crew-design/04 §5) — ids only, deep-links the character page.
  "crew-proposal": {
    type: "crew-proposal",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    characterId: SAMPLE_CHARACTER_ID,
    proposalId: SAMPLE_CARD_PROPOSAL_ID,
  },
  // The automation `post_notification` arm (automation-design/03 §1.5) — the ONE member carrying a rendered
  // (capped) `message` string; still secret-unrepresentable (a capped string, not a handle).
  "automation-notice": {
    type: "automation-notice",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
    source: { kind: "rule", ruleId: SAMPLE_AUTOMATION_RULE_ID },
    message: "the tavern grows quiet",
  },
  // The plugin auto-disable notice (plugin-design/03 §4) — ids only, deep-links the owner's plugin surface.
  "plugin-disabled": {
    type: "plugin-disabled",
    recipientUserId: SAMPLE_RECIPIENT,
    pluginId: SAMPLE_PLUGIN_ID,
  },
};

const EXPECTED_VARIANT_COUNT = 9;

// CLOSED PIN: the union has EXACTLY the nine delivery reasons and no more. `.options.length` catches a
// stray added member; the FIXTURES Record key set is the type-checked mirror.
test("NotificationEvent is the closed 9-member delivery union", () => {
  expect(notificationEventSchema.options).toHaveLength(EXPECTED_VARIANT_COUNT);
  expect(Object.keys(FIXTURES).sort()).toEqual(
    [
      "agent-seat-requested",
      "automation-notice",
      "crew-proposal",
      "deferred-turn-dropped",
      "handoff-accepted",
      "handoff-nominated",
      "invite",
      "kicked",
      "plugin-disabled",
    ].sort(),
  );
});

// ROUND-TRIP: the representative `invite` variant (the richest payload) survives parse unchanged.
test("notificationEventSchema round-trips a representative variant unchanged", () => {
  const event = FIXTURES.invite;
  expect(notificationEventSchema.parse(event)).toEqual(event);
});

test("notificationEventSchema accepts every closed variant", () => {
  for (const event of Object.values(FIXTURES)) {
    expect(notificationEventSchema.parse(event)).toEqual(event);
  }
});

// MANDATORY recipient (invariant: every variant names its single recipient): strip recipientUserId from
// each fixture and assert the schema rejects it — a notification with no recipient is unrepresentable.
test("every variant REQUIRES recipientUserId", () => {
  for (const event of Object.values(FIXTURES)) {
    const { recipientUserId: _dropped, ...withoutRecipient } = event;
    expect(notificationEventSchema.safeParse(withoutRecipient).success).toBe(false);
  }
});

// CLOSED discriminant: an unknown `type` is rejected (no open/catch-all arm).
test("an unknown discriminant is rejected", () => {
  const unknownReason = {
    type: "credential-leaked",
    recipientUserId: SAMPLE_RECIPIENT,
    chatId: SAMPLE_CHAT_ID,
  };
  expect(notificationEventSchema.safeParse(unknownReason).success).toBe(false);
});

// SECRET-UNREPRESENTABLE (`bus-payload-allowlist`): the members are plain
// `z.object` (NOT `.loose()`), so an injected secret-bearing field is STRIPPED at parse — it can never
// ride through into the durable row or the stream. If someone loosens the schema, this goes red. The value
// is an obvious non-secret literal (noSecrets) — the field NAME is what an exfil attempt would use.
test("an injected secret field is stripped at the schema boundary", () => {
  const withInjectedSecret = {
    ...FIXTURES.kicked,
    apiKey: "injected-extra-field",
    baseUrl: "injected-extra-field",
  };
  const parsed = notificationEventSchema.parse(withInjectedSecret);
  expect("apiKey" in parsed).toBe(false);
  expect("baseUrl" in parsed).toBe(false);
  expect(parsed).toEqual(FIXTURES.kicked);
});

// Compile-time belt backing the secret-unrepresentable rule: a secret-bearing field is not part of ANY variant's declared
// shape. Narrowing to `invite` then indexing a non-existent `apiKey` would be a `tsc` error — we instead
// assert the key set is finite/known by exhaustively listing it (an index signature would defeat this).
test("NotificationEvent variants expose only the allowlisted fields", () => {
  const inviteKeys = Object.keys(FIXTURES.invite).sort();
  expect(inviteKeys).toEqual(["chatId", "inviteId", "invitedByHandle", "recipientUserId", "type"].sort());
  const kickedKeys = Object.keys(FIXTURES.kicked).sort();
  expect(kickedKeys).toEqual(["chatId", "recipientUserId", "type"].sort());
  // The seat-request carries only the ids the host needs to act (ownerUserId/sourceKind) + a display
  // handle — never a soul prompt / agent internals (doc 06 §3: notified to the human host).
  const seatRequestKeys = Object.keys(FIXTURES["agent-seat-requested"]).sort();
  expect(seatRequestKeys).toEqual(["chatId", "ownerUserId", "recipientUserId", "requestedByHandle", "sourceKind", "type"].sort());
  // The crew card-proposal carries ONLY ids (secret-free by construction, chat-crew-design/04 §5).
  const crewProposalKeys = Object.keys(FIXTURES["crew-proposal"]).sort();
  expect(crewProposalKeys).toEqual(["chatId", "characterId", "proposalId", "recipientUserId", "type"].sort());
  // The automation-notice carries ids + the ONE rendered `message` (the argued capped-string exception,
  // automation-design/03 §1.5) — never a credential/handle.
  const automationNoticeKeys = Object.keys(FIXTURES["automation-notice"]).sort();
  expect(automationNoticeKeys).toEqual(["chatId", "message", "recipientUserId", "source", "type"].sort());
  // The plugin-disabled notice carries ONLY ids (no free error string — the detail lives on the plugin row).
  const pluginDisabledKeys = Object.keys(FIXTURES["plugin-disabled"]).sort();
  expect(pluginDisabledKeys).toEqual(["pluginId", "recipientUserId", "type"].sort());
});

// The `message` cap (automation-design/03 §1.5): a rendered string past the cap is rejected — the wire never
// carries an unbounded blob (the exact belt that keeps the argued exception closed).
test("automation-notice message is length-capped", () => {
  const over = { ...FIXTURES["automation-notice"], message: "x".repeat(AUTOMATION_NOTICE_MESSAGE_MAX + 1) };
  expect(notificationEventSchema.safeParse(over).success).toBe(false);
});

// PresenceView shape pin: per-user, read-only, server-derived (no schema — presence is never client-asserted).
test("PresenceView pins the per-user presence shape", () => {
  const presentView: PresenceView = {
    userId: SAMPLE_RECIPIENT,
    online: true,
    lastSeenAt: null,
  };
  expect(Object.keys(presentView).sort()).toEqual(["lastSeenAt", "online", "userId"].sort());
  const offlineView: PresenceView = {
    userId: SAMPLE_RECIPIENT,
    online: false,
    lastSeenAt: 0,
  };
  expect(offlineView.online).toBe(false);
});
