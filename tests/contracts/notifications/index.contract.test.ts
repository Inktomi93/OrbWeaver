import type {
  NotificationEvent,
  NotificationType,
  PresenceView,
} from "@orb/contracts/notifications";
import { notificationEventSchema } from "@orb/contracts/notifications";
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
};

const EXPECTED_VARIANT_COUNT = 5;

// CLOSED PIN: the union has EXACTLY the five delivery reasons and no more. `.options.length` catches a
// stray added member; the FIXTURES Record key set is the type-checked mirror.
test("NotificationEvent is the closed 5-member delivery union", () => {
  expect(notificationEventSchema.options).toHaveLength(EXPECTED_VARIANT_COUNT);
  expect(Object.keys(FIXTURES).sort()).toEqual(
    ["deferred-turn-dropped", "handoff-accepted", "handoff-nominated", "invite", "kicked"].sort(),
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
  expect(inviteKeys).toEqual(
    ["chatId", "inviteId", "invitedByHandle", "recipientUserId", "type"].sort(),
  );
  const kickedKeys = Object.keys(FIXTURES.kicked).sort();
  expect(kickedKeys).toEqual(["chatId", "recipientUserId", "type"].sort());
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
